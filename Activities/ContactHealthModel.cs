using ConversaCore.Cards;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace InsuranceAgent.Topics;

/// <summary>
/// Model for contact and health details form data.
/// Inherits from BaseCardModel for continuation support.
/// </summary>
public class ContactHealthModel : BaseCardModel
{
    [JsonPropertyName("address")]
    [Required(ErrorMessage = "Address is required")]
    [StringLength(200, ErrorMessage = "Address cannot exceed 200 characters")]
    public string Address { get; set; } = string.Empty;

    [JsonPropertyName("city_state")]
    [Required(ErrorMessage = "City and state is required")]
    [StringLength(100, ErrorMessage = "City and state cannot exceed 100 characters")]
    public string CityState { get; set; } = string.Empty;

    [JsonPropertyName("dob")]
    [Required(ErrorMessage = "Date of birth is required")]
    public string DateOfBirth { get; set; } = string.Empty;

    [JsonPropertyName("hospitalized_past_5_years")]
    public string HospitalizedPast5Years { get; set; } = "false";

    [JsonPropertyName("currently_taking_medications")]
    public string CurrentlyTakingMedications { get; set; } = "false";

    [JsonPropertyName("medications")]
    [StringLength(500, ErrorMessage = "Medications list cannot exceed 500 characters")]
    public string? Medications { get; set; }

    [JsonPropertyName("medical_conditions")]
    [StringLength(500, ErrorMessage = "Medical conditions list cannot exceed 500 characters")]
    public string? MedicalConditions { get; set; }

    [JsonPropertyName("tobacco_use_last_12_months")]
    public string TobaccoUseLast12Months { get; set; } = "false";

    // Computed properties for business logic
    public bool WasHospitalized => HospitalizedPast5Years?.ToLower() == "true";
    public bool TakesMedications => CurrentlyTakingMedications?.ToLower() == "true";
    public bool UsesTobacco => TobaccoUseLast12Months?.ToLower() == "true";
    
    public bool HasMedications => !string.IsNullOrWhiteSpace(Medications);
    public bool HasMedicalConditions => !string.IsNullOrWhiteSpace(MedicalConditions);
    
    // Parse medications and conditions into lists
    public List<string> MedicationsList => 
        string.IsNullOrWhiteSpace(Medications) 
            ? new List<string>() 
            : Medications.Split(',', StringSplitOptions.RemoveEmptyEntries)
                       .Select(m => m.Trim())
                       .Where(m => !string.IsNullOrEmpty(m))
                       .ToList();
    
    public List<string> MedicalConditionsList => 
        string.IsNullOrWhiteSpace(MedicalConditions) 
            ? new List<string>() 
            : MedicalConditions.Split(',', StringSplitOptions.RemoveEmptyEntries)
                             .Select(c => c.Trim())
                             .Where(c => !string.IsNullOrEmpty(c))
                             .ToList();

    // Age calculation helper
    public int? CalculatedAge
    {
        get
        {
            if (DateTime.TryParse(DateOfBirth, out var birthDate))
            {
                var today = DateTime.Today;
                var age = today.Year - birthDate.Year;
                if (birthDate.Date > today.AddYears(-age)) age--;
                return age;
            }
            return null;
        }
    }

    // Risk assessment helper
    public bool HasHealthRiskFactors => WasHospitalized || UsesTobacco || HasMedicalConditions;
}