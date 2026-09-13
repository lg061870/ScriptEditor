using ScriptEditor.Components;
using ScriptEditor.Endpoints;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

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
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.MapTranscriptionEndpoints();

app.Run();
