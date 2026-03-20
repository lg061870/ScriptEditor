using ConversaCore.TopicFlow;
using System;
using System.Collections.Generic;
using System.Text.Json;

namespace ConversaCore.TopicFlow
{
    /// <summary>
    /// A key-value store for workflow state.
    /// </summary>
    public class TopicWorkflowContext
    {
    // (keep only one declaration below)

        // Reserved root key for aggregated data intelligence
        private const string IntelligenceRootKey = "Intelligence";

        // DEBUG: Tracking Context Lifecycle
        public override string ToString()
        {
            var sb = new System.Text.StringBuilder();
            foreach (var kvp in _values)
            {
                sb.Append(kvp.Key);
                sb.Append(": ");
                if (kvp.Value is string s)
                    sb.Append(s);
                else if (kvp.Value != null)
                    sb.Append(kvp.Value.GetType().ToString());
                else
                    sb.Append("null");
                sb.AppendLine();
            }
            return sb.ToString();
        }
        private readonly Dictionary<string, object> _values = new Dictionary<string, object>();
        
        /// <summary>
        /// Sets a value in the workflow context.
        /// </summary>
        /// <param name="key">The key to store the value under.</param>
        /// <param name="value">The value to store.</param>
        public void SetValue(string key, object? value)
        {
            if (string.IsNullOrEmpty(key))
                throw new ArgumentNullException(nameof(key));
                
            if (value == null)
            {
                if (_values.ContainsKey(key))
                    _values.Remove(key);
                return;
            }
            
            _values[key] = value;
        }

        /// <summary>
        /// Gets a value from the workflow context.
        /// </summary>
        /// <typeparam name="T">The type to convert the value to.</typeparam>
        /// <param name="key">The key to retrieve the value for.</param>
        /// <returns>The value if found and convertible to T; default(T) otherwise.</returns>
        public T? GetValue<T>(string key) {
            if (string.IsNullOrEmpty(key) || !_values.ContainsKey(key))
                return default;

            var value = _values[key];

            if (value is T typedValue)
                return typedValue;

            try {
                // 🔹 Handle JsonElement (common in JSON-based contexts)
                if (value is JsonElement jsonElement) {
                    object? unwrapped = jsonElement.ValueKind switch {
                        JsonValueKind.String => jsonElement.GetString(),
                        JsonValueKind.Number => jsonElement.TryGetInt64(out var i64) ? i64 : jsonElement.TryGetDouble(out var dbl) ? dbl : (object?)null,
                        JsonValueKind.True => true,
                        JsonValueKind.False => false,
                        JsonValueKind.Null or JsonValueKind.Undefined => null,
                        _ => jsonElement.ToString()
                    };

                    // Convert again if needed
                    if (unwrapped is T direct)
                        return direct;

                    if (unwrapped != null)
                        return (T)Convert.ChangeType(unwrapped, typeof(T));
                }

                // Fallback: normal conversion
                return (T)Convert.ChangeType(value, typeof(T));
            } catch {
                return default;
            }
        }


        /// <summary>
        /// Gets a value from the workflow context or a default value if not found.
        /// </summary>
        /// <typeparam name="T">The type to convert the value to.</typeparam>
        /// <param name="key">The key to retrieve the value for.</param>
        /// <param name="defaultValue">The default value to return if the key is not found.</param>
        /// <returns>The value if found and convertible to T; defaultValue otherwise.</returns>
        public T GetValue<T>(string key, T defaultValue)
        {
            var value = GetValue<T>(key);
            return value != null ? value : defaultValue;
        }


        
        /// <summary>
        /// Checks if the workflow context contains a specific key.
        /// </summary>
        /// <param name="key">The key to check for.</param>
        /// <returns>True if the key exists; false otherwise.</returns>
        public bool ContainsKey(string key)
        {
            return !string.IsNullOrEmpty(key) && _values.ContainsKey(key);
        }
        
        /// <summary>
        /// Gets all keys in the workflow context.
        /// </summary>
        /// <returns>An enumerable of all keys.</returns>
        public IEnumerable<string> GetKeys()
        {
            return _values.Keys;
        }
        
        /// <summary>
        /// Clears all values from the workflow context.
        /// </summary>
        public void Clear()
        {
            _values.Clear();
        }

        public void RemoveValue(string key) {
            if (string.IsNullOrEmpty(key)) return;
            _values.Remove(key);
        }


        /// <summary>
        /// Gets the number of items in the workflow context.
        /// </summary>
        public int Count => _values.Count;

        /// -------------------------------------------------------
        /// ✅ NEW METHOD: Dictionary-style TryGetValue<T>
        /// -------------------------------------------------------
        public bool TryGetValue<T>(string key, out T? result) {
            result = default;

            if (string.IsNullOrEmpty(key))
                return false;

            if (!_values.TryGetValue(key, out var raw))
                return false;

            // Direct cast works?
            if (raw is T direct) {
                result = direct;
                return true;
            }

            try {
                // JSON case
                if (raw is JsonElement el) {
                    object? unwrapped = el.ValueKind switch {
                        JsonValueKind.String => el.GetString(),
                        JsonValueKind.Number =>
                            el.TryGetInt64(out var i64) ? i64 :
                            el.TryGetDouble(out var dbl) ? dbl : (object?)null,
                        JsonValueKind.True => true,
                        JsonValueKind.False => false,
                        JsonValueKind.Null or JsonValueKind.Undefined => null,
                        _ => el.ToString()
                    };

                    if (unwrapped is T castUnwrapped) {
                        result = castUnwrapped;
                        return true;
                    }

                    if (unwrapped != null) {
                        result = (T)Convert.ChangeType(unwrapped, typeof(T));
                        return true;
                    }

                    return false;
                }

                // Normal conversion
                result = (T)Convert.ChangeType(raw, typeof(T));
                return true;
            } catch {
                return false;
            }
        }
        /// -------------------------------------------------------
        /// 

        /// <summary>
        /// Attempts to get a value from the context without knowing the type.
        /// Automatically unwraps JsonElement and returns a native .NET object.
        /// </summary>
        public bool TryGetValue(string key, out object? result) {
            result = null;

            if (string.IsNullOrWhiteSpace(key))
                return false;

            if (!_values.TryGetValue(key, out var raw))
                return false;

            // Direct non-JSON value
            if (raw is not JsonElement el) {
                result = raw;
                return true;
            }

            // Unwrap JsonElement
            try {
                result = el.ValueKind switch {
                    JsonValueKind.String => el.GetString(),
                    JsonValueKind.Number =>
                        el.TryGetInt64(out var i64) ? i64 :
                        el.TryGetDouble(out var dbl) ? dbl : null,
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    JsonValueKind.Null or JsonValueKind.Undefined => null,
                    _ => el.ToString()
                };

                return true;
            } catch {
                result = null;
                return false;
            }
        }

        /// <summary>
        /// Attempts to read a named property from a model stored in the context under <paramref name="modelKey"/>.
        /// Supports values stored as IDictionary&lt;string, object&gt;, Dictionary&lt;string, object&gt;, JsonElement (object),
        /// or plain CLR objects (via reflection). Returns false if the model or property is not present or cannot be converted.
        /// </summary>
        public bool TryGetModelProperty<T>(string modelKey, string propertyName, out T? value) {
            value = default;
            if (string.IsNullOrWhiteSpace(modelKey) || string.IsNullOrWhiteSpace(propertyName))
                return false;

            if (!_values.TryGetValue(modelKey, out var rawModel) || rawModel == null)
                return false;

            try {
                // IDictionary<string, object> case
                if (rawModel is IDictionary<string, object> dict) {
                    if (dict.TryGetValue(propertyName, out var v) && v != null) {
                        if (v is T tv) { value = tv; return true; }
                        if (v is System.Text.Json.JsonElement je) {
                            // unwrap JsonElement
                            if (je.ValueKind == JsonValueKind.String) {
                                var s = je.GetString();
                                if (s != null) { value = (T)Convert.ChangeType(s, typeof(T)); return true; }
                            }
                            if (je.ValueKind == JsonValueKind.Number) {
                                if (je.TryGetInt64(out var i64)) { value = (T)Convert.ChangeType(i64, typeof(T)); return true; }
                                if (je.TryGetDouble(out var d)) { value = (T)Convert.ChangeType(d, typeof(T)); return true; }
                            }
                            if (je.ValueKind == JsonValueKind.True || je.ValueKind == JsonValueKind.False) {
                                value = (T)Convert.ChangeType(je.GetBoolean(), typeof(T)); return true;
                            }
                            // fallback to string
                            var raw = je.ToString();
                            if (raw != null) { value = (T)Convert.ChangeType(raw, typeof(T)); return true; }
                        }

                        // Try direct conversion
                        value = (T)Convert.ChangeType(v, typeof(T));
                        return true;
                    }
                    return false;
                }

                // JsonElement representing an object
                if (rawModel is JsonElement modelEl && modelEl.ValueKind == JsonValueKind.Object) {
                    if (modelEl.TryGetProperty(propertyName, out var prop)) {
                        if (prop.ValueKind == JsonValueKind.String) {
                            var s = prop.GetString(); if (s != null) { value = (T)Convert.ChangeType(s, typeof(T)); return true; }
                        }
                        if (prop.ValueKind == JsonValueKind.Number) {
                            if (prop.TryGetInt64(out var i64)) { value = (T)Convert.ChangeType(i64, typeof(T)); return true; }
                            if (prop.TryGetDouble(out var d)) { value = (T)Convert.ChangeType(d, typeof(T)); return true; }
                        }
                        if (prop.ValueKind == JsonValueKind.True || prop.ValueKind == JsonValueKind.False) {
                            value = (T)Convert.ChangeType(prop.GetBoolean(), typeof(T)); return true;
                        }
                        var raw = prop.ToString(); if (raw != null) { value = (T)Convert.ChangeType(raw, typeof(T)); return true; }
                    }
                    return false;
                }

                // Plain CLR object: use reflection
                var modelType = rawModel.GetType();
                var pi = modelType.GetProperty(propertyName, System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.IgnoreCase);
                if (pi != null) {
                    var got = pi.GetValue(rawModel);
                    if (got == null) return false;
                    if (got is T tgot) { value = tgot; return true; }
                    value = (T)Convert.ChangeType(got, typeof(T));
                    return true;
                }

                return false;
            } catch {
                value = default;
                return false;
            }
        }

        /// <summary>
        /// Convenience getter that returns <paramref name="defaultValue"/> when property not found.
        /// </summary>
        public T GetModelProperty<T>(string modelKey, string propertyName, T defaultValue = default) {
            return TryGetModelProperty<T>(modelKey, propertyName, out var v) ? v! : defaultValue;
        }

        // =======================================================
        // DATA INTELLIGENCE SUPPORT
        // =======================================================

        /// <summary>
        /// Represents a single intelligence signal with metadata.
        /// </summary>
        private sealed class IntelligenceEntry
        {
            public object? Value { get; set; }
            public double Confidence { get; set; }
            public string Source { get; set; } = string.Empty;
            public string ActivityId { get; set; } = string.Empty;
            public DateTime LastUpdatedAt { get; set; } = DateTime.UtcNow;
        }

        /// <summary>
        /// Internal helper to get or create the intelligence dictionary
        /// stored under the reserved Intelligence root key.
        /// </summary>
        private Dictionary<string, IntelligenceEntry> GetOrCreateIntelligenceStore()
        {
            if (_values.TryGetValue(IntelligenceRootKey, out var existing) &&
                existing is Dictionary<string, IntelligenceEntry> dict)
            {
                return dict;
            }

            var store = new Dictionary<string, IntelligenceEntry>(StringComparer.OrdinalIgnoreCase);
            _values[IntelligenceRootKey] = store;
            return store;
        }

        /// <summary>
        /// Merges an intelligence signal into the aggregated intelligence store.
        /// If an entry already exists at the given path, the higher-confidence
        /// value wins; ties keep the existing value.
        /// </summary>
        /// <param name="path">Logical intelligence path, e.g. "Person.FirstName".</param>
        /// <param name="value">The inferred value to store.</param>
        /// <param name="confidence">Confidence score in [0,1].</param>
        /// <param name="source">Source label (e.g., "Semantic", "Card").</param>
        /// <param name="activityId">Semantic or workflow activity that produced the value.</param>
        public void MergeIntelligence(string path, object? value, double confidence, string source, string activityId)
        {
            if (string.IsNullOrWhiteSpace(path) || value == null)
                return;

            confidence = Math.Clamp(confidence, 0.0, 1.0);
            var store = GetOrCreateIntelligenceStore();

            if (store.TryGetValue(path, out var existing))
            {
                if (confidence > existing.Confidence)
                {
                    store[path] = new IntelligenceEntry
                    {
                        Value = value,
                        Confidence = confidence,
                        Source = source,
                        ActivityId = activityId,
                        LastUpdatedAt = DateTime.UtcNow
                    };
                }
                return;
            }

            store[path] = new IntelligenceEntry
            {
                Value = value,
                Confidence = confidence,
                Source = source,
                ActivityId = activityId,
                LastUpdatedAt = DateTime.UtcNow
            };
        }

        /// <summary>
        /// Attempts to read an intelligence signal by logical path, enforcing
        /// a minimum confidence threshold.
        /// </summary>
        /// <typeparam name="T">Expected CLR type of the value.</typeparam>
        /// <param name="path">Logical intelligence path, e.g. "Person.FirstName".</param>
        /// <param name="minConfidence">Minimum confidence required to accept the value.</param>
        /// <param name="value">The output value when successful.</param>
        /// <returns>True if a value was found and met the confidence threshold.</returns>
        public bool TryGetIntelligence<T>(string path, double minConfidence, out T? value)
        {
            value = default;

            if (string.IsNullOrWhiteSpace(path) ||
                !_values.TryGetValue(IntelligenceRootKey, out var existing) ||
                existing is not Dictionary<string, IntelligenceEntry> store ||
                !store.TryGetValue(path, out var entry) ||
                entry.Confidence < minConfidence)
            {
                return false;
            }

            try
            {
                if (entry.Value is T t)
                {
                    value = t;
                    return true;
                }

                if (entry.Value != null)
                {
                    value = (T)Convert.ChangeType(entry.Value, typeof(T));
                    return true;
                }
            }
            catch
            {
                value = default;
            }

            return false;
        }

        /// <summary>
        /// Convenience method to get an intelligence signal or a default
        /// when not present or below the desired confidence.
        /// </summary>
        public T GetIntelligence<T>(string path, double minConfidence = 0.0, T defaultValue = default)
        {
            return TryGetIntelligence<T>(path, minConfidence, out var v) ? v! : defaultValue;
        }

    }
}

