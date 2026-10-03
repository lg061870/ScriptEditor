using ConversaCore.Context;
using ConversaCore.Interfaces;
using ConversaCore.Registration;
using ConversaCore.Runtime;
using ConversaCore.UI.Services;
using Microsoft.Extensions.Logging.Abstractions;
using ScriptEditor.Components;
using ScriptEditor.Endpoints;
using ScriptEditor.Runtime;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

// ConversaCore Dynamic Catalog and Runtime Services
builder.Services.AddSingleton<DynamicTopicCatalog>();
builder.Services.AddSingleton<ITopicCatalog>(sp => sp.GetRequiredService<DynamicTopicCatalog>());

builder.Services.AddScoped<IChatInteropService, ChatInteropService>();
builder.Services.AddScoped<IConversationContext>(_ => new ConversationContext(
    Guid.NewGuid().ToString("N"), "editor", NullLogger<ConversationContext>.Instance));

builder.Services.AddTransient<Microsoft.SemanticKernel.Kernel>(sp => new Microsoft.SemanticKernel.Kernel(sp));

new ConversaCoreBuilder(builder.Services)
    .AddConversationRuntime("editor.current", new TopicRouterOptions { FallbackTopicId = "editor.fallback" });

// canvas-app (Phase 3.3) is a standalone Vite dev server on a different
// origin/port than this API -- per the roadmap's own architecture
// ("A small .NET API wraps the Roslyn transcriber", canvas-app own build),
// these are two separate origins in both dev and production, so this needs
// real CORS, not a same-origin assumption. Permissive to any localhost port
// for now (dev-phase only); tighten to the actual deployed canvas-app
// origin once one exists.
const string CanvasAppCorsPolicy = "CanvasAppDev";
builder.Services.AddCors(options =>
{
    options.AddPolicy(CanvasAppCorsPolicy, policy =>
        policy.SetIsOriginAllowed(origin => new Uri(origin).IsLoopback)
              .AllowAnyHeader()
              .AllowAnyMethod());
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseCors(CanvasAppCorsPolicy);

app.UseAntiforgery();

app.MapStaticAssets();

var canvasDistPath = Path.Combine(app.Environment.ContentRootPath, "canvas-app", "dist");
if (Directory.Exists(canvasDistPath))
{
    var distProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(canvasDistPath);
    app.UseDefaultFiles(new DefaultFilesOptions
    {
        FileProvider = distProvider
    });
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = distProvider
    });
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = distProvider,
        RequestPath = "/canvas"
    });
}

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.MapTranscriptionEndpoints();
app.MapWorkflowEndpoints();
app.MapProjectEndpoints();

app.Run();
