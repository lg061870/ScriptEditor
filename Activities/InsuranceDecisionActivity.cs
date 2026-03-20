using ConversaCore.TopicFlow.Activities;
using Microsoft.Extensions.Logging;
using Microsoft.SemanticKernel;
using System.Text.Json;

namespace ConversaCore.TopicFlow;

/// <summary>
/// Specialized semantic activity for insurance eligibility decision making.
/// Analyzes user profiles against complex JSON insurance rules to determine eligibility.
/// </summary>
public class InsuranceDecisionActivity : SemanticActivity
{
    public string RulesFilePath { get; set; } = string.Empty;
    public string UserProfileContextKey { get; set; } = "UserProfile";

    public InsuranceDecisionActivity(string activityId, Kernel kernel, ILogger logger) 
        : base(activityId, kernel, logger)
    {
        RequireJsonOutput = true;
        Temperature = 0.3f; // Lower temperature for more deterministic results
        ModelId = "gpt-4o"; // Use more capable model for complex decision making
    }

    protected override async Task<string> BuildSystemPromptAsync(TopicWorkflowContext context, object? input)
    {
        // Load the insurance rules from the JSON file
        var rulesJson = await LoadInsuranceRulesAsync();

        return $@"You are an expert insurance underwriter AI assistant. Your task is to analyze a potential insurance customer's profile against comprehensive insurance carrier rules and determine their eligibility for various insurance products.

## Your Role
- Analyze the customer's medical history, demographics, and other factors
- Apply complex time-based exceptions and conditional rules
- Categorize matches into ""perfect matches"" and ""near matches""
- Provide clear reasoning for decisions

## Insurance Rules Database
You have access to the following insurance carrier rules:
{rulesJson}

## Decision Categories
1. **Perfect Matches**: Customer meets all requirements with no exceptions needed
2. **Near Matches**: Customer has health issues or other factors that would normally disqualify them, but they happened long enough ago or meet specific exception criteria defined in the rules

## Time-Based Exceptions
Pay special attention to rules with time qualifiers like:
- ""Y IF > 2 YEARS SINCE DIAGNOSIS AND TREATMENT""
- ""Y IF > 5 YEARS SINCE DIAGNOSIS AND TREATMENT""
- ""Y IF > 10 YEARS SINCE TREATMENT""
- Age-related conditions like ""Y IF > 30 YEARS OLD WHEN DIAGNOSED""

## Output Format
You MUST respond with valid JSON in this exact structure:
{{
    ""perfectMatches"": [
        {{
            ""carrierName"": ""Carrier Name"",
            ""productType"": ""TERM"",
            ""ageRange"": ""18-65"",
            ""benefitRange"": ""$250,000"",
            ""reasoning"": ""Clear explanation of why this is a perfect match""
        }}
    ],
    ""nearMatches"": [
        {{
            ""carrierName"": ""Carrier Name"",
            ""productType"": ""TERM"",
            ""ageRange"": ""18-65"",
            ""benefitRange"": ""$250,000"",
            ""reasoning"": ""Explanation of the exception criteria met (e.g., 'Customer had diabetes but was diagnosed at age 32, meets >30 years old criteria')"",
            ""exceptionCondition"": ""Specific rule that allows this near match""
        }}
    ],
    ""disqualifiedCarriers"": [
        {{
            ""carrierName"": ""Carrier Name"",
            ""reason"": ""Specific disqualifying condition""
        }}
    ],
    ""summary"": {{
        ""totalPerfectMatches"": 0,
        ""totalNearMatches"": 0,
        ""recommendedAction"": ""Brief recommendation for the customer""
    }}
}}

## Analysis Approach
1. Compare each condition in the customer profile against each carrier's rules
2. Look for time-based exceptions for conditions that would otherwise disqualify
3. Consider age, smoking status, and other demographic factors
4. Apply complex conditional logic (Y IF conditions)
5. Categorize results appropriately with clear reasoning";
    }

    protected override async Task<string> BuildUserPromptAsync(TopicWorkflowContext context, object? input)
    {
        // Get the user profile from context
        var userProfile = context.GetValue<object>(UserProfileContextKey);
        
        if (userProfile == null)
        {
            throw new InvalidOperationException($"User profile not found in context at key '{UserProfileContextKey}'. Please ensure the user profile is collected before running insurance decision analysis.");
        }

        // Serialize the user profile for analysis
        var userProfileJson = JsonSerializer.Serialize(userProfile, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true
        });

        return $@"Please analyze the following customer profile against all available insurance carrier rules and provide a comprehensive eligibility assessment:

## Customer Profile
{userProfileJson}

## Analysis Requirements
1. Review EVERY carrier in the rules database
2. Check ALL medical conditions, legal issues, and other factors
3. Apply time-based exceptions where applicable
4. Consider age-related criteria
5. Factor in smoking status, build requirements, and demographics
6. Categorize into perfect matches (no exceptions needed) and near matches (exceptions apply)

## Special Instructions
- If a condition is marked as ""N"" (No), check if there are time-based exceptions
- Pay attention to age thresholds in diabetes rules
- Consider multiple DUI vs single DUI distinctions
- Look for smoking vs non-smoking product variations
- Apply build chart restrictions where specified

Please provide your analysis in the required JSON format with detailed reasoning for each decision.";
    }

    private async Task<string> LoadInsuranceRulesAsync()
    {
        try
        {
            if (string.IsNullOrEmpty(RulesFilePath))
            {
                throw new InvalidOperationException("RulesFilePath must be set before executing InsuranceDecisionActivity");
            }

            if (!File.Exists(RulesFilePath))
            {
                throw new FileNotFoundException($"Insurance rules file not found at path: {RulesFilePath}");
            }

            var rulesContent = await File.ReadAllTextAsync(RulesFilePath);
            
            // Validate that it's valid JSON
            try
            {
                JsonDocument.Parse(rulesContent);
            }
            catch (JsonException ex)
            {
                throw new InvalidDataException($"Invalid JSON in rules file: {ex.Message}");
            }

            _semanticLogger.LogDebug("Successfully loaded insurance rules from {RulesFilePath}", RulesFilePath);
            return rulesContent;
        }
        catch (Exception ex)
        {
            _semanticLogger.LogError(ex, "Failed to load insurance rules from {RulesFilePath}", RulesFilePath);
            throw;
        }
    }

    protected async Task StoreResultsInContextAsync(TopicWorkflowContext context, string response)
    {
        // Store the base result
        await base.StoreResultsInContextAsync(context, response);

        // Parse and store structured decision data for easy access by subsequent activities
        try
        {
            var decision = JsonSerializer.Deserialize<InsuranceDecisionResult>(response, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            if (decision != null)
            {
                context.SetValue($"{Id}_Decision", decision);
                context.SetValue($"{Id}_PerfectMatchCount", decision.PerfectMatches?.Count ?? 0);
                context.SetValue($"{Id}_NearMatchCount", decision.NearMatches?.Count ?? 0);
                
                _semanticLogger.LogInformation("Insurance decision completed: {PerfectMatches} perfect matches, {NearMatches} near matches", 
                    decision.PerfectMatches?.Count ?? 0, 
                    decision.NearMatches?.Count ?? 0);
            }
        }
        catch (JsonException ex)
        {
            _semanticLogger.LogWarning(ex, "Failed to parse insurance decision response as structured data");
        }
    }
}

/// <summary>
/// Structured result from insurance decision analysis
/// </summary>
public class InsuranceDecisionResult
{
    public List<InsuranceMatch>? PerfectMatches { get; set; }
    public List<InsuranceNearMatch>? NearMatches { get; set; }
    public List<InsuranceDisqualification>? DisqualifiedCarriers { get; set; }
    public InsuranceDecisionSummary? Summary { get; set; }
}

public class InsuranceMatch
{
    public string? CarrierName { get; set; }
    public string? ProductType { get; set; }
    public string? AgeRange { get; set; }
    public string? BenefitRange { get; set; }
    public string? Reasoning { get; set; }
}

public class InsuranceNearMatch : InsuranceMatch
{
    public string? ExceptionCondition { get; set; }
}

public class InsuranceDisqualification
{
    public string? CarrierName { get; set; }
    public string? Reason { get; set; }
}

public class InsuranceDecisionSummary
{
    public int TotalPerfectMatches { get; set; }
    public int TotalNearMatches { get; set; }
    public string? RecommendedAction { get; set; }
}