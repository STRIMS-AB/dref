package dev.dref;

import dev.regl.Rule;
import dev.regl.RuleType;
import dev.regl.ParameterType;
import dev.regl.Range;
import dev.regl.ValidationResult;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * In-memory representation of a DRef Domain Document: the domain configuration
 * (name, version, description, {@code defaults}), its scopes, and its models.
 * Scopes and models are siblings — each model may reference a scope by name via
 * {@link DomainModel#scope()}, but a model without a scope lives directly in the
 * domain.
 *
 * <p>Instances are parsed from a JSON-shaped {@code Map} (as produced by any JSON
 * library, e.g. Jackson or Gson) with {@link #from(Map)}, or built programmatically
 * with {@link #builder(String)}. The domain supports updates after construction:
 * scopes and models can be added or removed, and the configuration changed.
 *
 * <p>The domain provides the {@code defaults.formats} used to validate
 * {@code Date}/{@code DateTime}/{@code Time} values across its models.
 */
public class DrefDomain {

    private String name;
    private String version;
    private String description;
    private DomainDefaults defaults;

    /** Mutable — {@link #addScope}/{@link #removeScope}/{@link #scope(String)}. */
    private final List<DomainScope> scopes = new ArrayList<>();
    /** Mutable — {@link #addModel}/{@link #removeModel}/{@link #model(String)}. */
    private final List<DomainModel> models = new ArrayList<>();

    public DrefDomain(String name, String version, String description, DomainDefaults defaults,
                      List<DomainScope> scopes, List<DomainModel> models) {
        this.name = name;
        this.version = version;
        this.description = description;
        this.defaults = defaults;
        if (scopes != null) this.scopes.addAll(scopes);
        if (models != null) this.models.addAll(models);
    }

    public static Builder builder(String name) {
        return new Builder(name);
    }

    /**
     * Parses a JSON-shaped map into a {@link DrefDomain}. The map may be produced
     * by any JSON library; every element is expected as {@code Map}/{@code List}/
     * {@code String}/{@code Number}/{@code Boolean}. Structure mirrors the JSON
     * Schema at {@code catalog/domain.schema.json}.
     */
    public static DrefDomain from(Map<String, Object> map) {
        if (map == null) {
            throw new IllegalArgumentException("Domain document map cannot be null.");
        }
        String name = str(map, "name");
        if (name == null) {
            throw new IllegalArgumentException("Domain document requires a 'name'.");
        }
        String version = str(map, "version");
        String description = str(map, "description");
        DrefDomain domain = new DrefDomain(name, version, description, null, null, null);
        domain.defaults = parseDefaults(mapOf(map.get("defaults")));

        for (Object rawScope : list(map.get("scopes"))) {
            Map<String, Object> scope = mapOf(rawScope);
            String scopeName = str(scope, "name");
            if (scopeName == null) {
                throw new IllegalArgumentException("Scope requires a 'name'.");
            }
            domain.scopes.add(new DomainScope(scopeName, str(scope, "description")));
        }

        Map<String, DomainFieldType> fieldTypes = domain.fieldTypes();
        Map<String, Map<String, Object>> rawModels = new LinkedHashMap<>();
        for (Object rawModel : list(map.get("models"))) {
            Map<String, Object> model = mapOf(rawModel);
            String modelName = str(model, "name");
            if (modelName != null) rawModels.putIfAbsent(modelName, model);
        }
        for (Object rawModel : list(map.get("models"))) {
            domain.models.add(parseModel(mapOf(rawModel), fieldTypes, rawModels));
        }
        return domain;
    }

    // ------------------------------------------------------------------ accessors

    public String name() { return name; }
    public String version() { return version; }
    public String description() { return description; }
    public DomainDefaults defaults() { return defaults; }

    /** The domain's default formats, falling back to ISO when not declared. */
    public Formats formats() {
        return defaults != null ? defaults.effectiveFormats() : Formats.ISO;
    }

    /** The resolved domain field types declared under {@code defaults.fields} (name -> definition). */
    public Map<String, DomainFieldType> fieldTypes() {
        return defaults != null ? defaults.fields() : Map.of();
    }

    public List<DomainScope> scopes() { return List.copyOf(scopes); }
    public List<DomainModel> models() { return List.copyOf(models); }

    public DomainScope scope(String scopeName) {
        for (DomainScope scope : scopes) {
            if (scope.name().equals(scopeName)) return scope;
        }
        return null;
    }

    public DomainModel model(String modelName) {
        for (DomainModel model : models) {
            if (model.name().equals(modelName)) return model;
        }
        return null;
    }

    // ------------------------------------------------------------------ updates

    public DrefDomain setName(String name) { this.name = name; return this; }
    public DrefDomain setVersion(String version) { this.version = version; return this; }
    public DrefDomain setDescription(String description) { this.description = description; return this; }
    public DrefDomain setDefaults(DomainDefaults defaults) { this.defaults = defaults; return this; }

    public DrefDomain addScope(DomainScope scope) {
        scopes.add(scope);
        return this;
    }

    public boolean removeScope(String scopeName) {
        return scopes.removeIf(s -> s.name().equals(scopeName));
    }

    public DrefDomain addModel(DomainModel model) {
        models.add(model);
        return this;
    }

    public boolean removeModel(String modelName) {
        return models.removeIf(m -> m.name().equals(modelName));
    }

    /**
     * Validates this domain document: configuration, scopes, models (each via
     * {@link DrefValidator#validateModel}) and the model scope references and
     * mapping definitions.
     */
    public ValidationResult validate() {
        return DrefValidator.validateDomain(this);
    }

    // ------------------------------------------------------------------ parsing

    private static DomainDefaults parseDefaults(Map<String, Object> defaults) {
        if (defaults == null) return null;
        Map<String, Object> formatsMap = mapOf(defaults.get("formats"));
        Formats formats = new Formats(str(formatsMap, "date"), str(formatsMap, "time"), str(formatsMap, "dateTime"));
        Map<String, Object> extra = new LinkedHashMap<>();
        Map<String, RawFieldType> rawFields = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : defaults.entrySet()) {
            String key = e.getKey();
            if (key.equals("formats")) continue;
            if (key.equals("fields")) {
                for (Map.Entry<String, Object> fieldEntry : mapOf(e.getValue()).entrySet()) {
                    String name = fieldEntry.getKey();
                    if (FieldType.fromLabelOrNull(name) != null) {
                        throw new IllegalArgumentException(
                                "Domain field type '" + name + "' shadows a builtin field type.");
                    }
                    Map<String, Object> decl = mapOf(fieldEntry.getValue());
                    rawFields.put(name, new RawFieldType(
                            str(decl, "type"),
                            bool(decl.get("list")),
                            parseRules(list(decl.get("rules")))));
                }
            } else {
                extra.put(key, e.getValue());
            }
        }
        return new DomainDefaults(formats, extra, resolveFieldTypes(rawFields));
    }

    /**
     * Resolves every {@code defaults.fields} declaration to a builtin-backed
     * {@link DomainFieldType}, expanding macro-to-macro references depth-first
     * with cycle detection.
     */
    private static Map<String, DomainFieldType> resolveFieldTypes(Map<String, RawFieldType> raw) {
        Map<String, DomainFieldType> resolved = new LinkedHashMap<>();
        for (String name : raw.keySet()) {
            resolveFieldType(name, raw, resolved, new LinkedHashSet<>());
        }
        return Map.copyOf(resolved);
    }

    private static DomainFieldType resolveFieldType(String name, Map<String, RawFieldType> raw,
                                                    Map<String, DomainFieldType> resolved, Set<String> stack) {
        DomainFieldType cached = resolved.get(name);
        if (cached != null) {
            return cached;
        }
        if (!stack.add(name)) {
            List<String> cycle = new ArrayList<>(stack);
            cycle.add(name);
            throw new IllegalArgumentException("Domain field type cycle detected: " + String.join(" -> ", cycle));
        }
        RawFieldType decl = raw.get(name);
        FieldType builtin = decl != null ? FieldType.fromLabelOrNull(decl.typeLabel()) : null;
        if (builtin != null) {
            stack.remove(name);
            DomainFieldType result = new DomainFieldType(builtin, decl.list(), decl.rules());
            resolved.put(name, result);
            return result;
        }
        DomainFieldType base = resolveFieldType(decl.typeLabel(), raw, resolved, stack);
        stack.remove(name);
        List<Rule> merged = new ArrayList<>(base.rules());
        merged.addAll(decl.rules());
        DomainFieldType result = new DomainFieldType(base.type(), base.list() || decl.list(), merged);
        resolved.put(name, result);
        return result;
    }

    private static List<Rule> parseRules(List<?> rawRules) {
        List<Rule> rules = new ArrayList<>();
        for (Object rawRule : rawRules) {
            rules.add(parseRule(mapOf(rawRule)));
        }
        return rules;
    }

    private static DomainModel parseModel(Map<String, Object> model, Map<String, DomainFieldType> fieldTypes,
                                          Map<String, Map<String, Object>> models) {
        String modelName = str(model, "name");
        if (modelName == null) {
            throw new IllegalArgumentException("Model requires a 'name'.");
        }
        DomainModel.Builder builder = DomainModel.builder(modelName)
                .authority(ModelAuthority.fromString(str(model, "authority")))
                .scope(str(model, "scope"));
        String ttl = str(model, "ttl");
        if (ttl != null) builder.ttl(ttl);
        builder.count(parseRange(mapOf(model.get("count"))));

        for (Object rawMapping : list(model.get("mapsFrom"))) {
            builder.map(parseMapping(mapOf(rawMapping)));
        }
        for (Object rawProperty : list(model.get("properties"))) {
            builder.property(parseProperty(modelName, mapOf(rawProperty), fieldTypes, models));
        }
        return builder.build();
    }

    /** The prefix of a model reference type ({@code #Customer}): a foreign key to that model's key. */
    public static final String MODEL_REFERENCE_PREFIX = "#";

    /** The rule that marks a property as written once ({@code { "type": "immutable" }}). */
    public static final String IMMUTABLE_RULE = "immutable";

    private static final java.util.regex.Pattern MODEL_NAME = java.util.regex.Pattern.compile("[A-Z][a-zA-Z0-9_]*");

    /**
     * The type a model reference validates as: the referenced model's key property's type
     * (its first property when it declares no key), following references and domain field
     * types; {@code String} when that is itself unresolvable (a reference cycle). The
     * referenced model must be declared in the same document (specification §3.1).
     */
    private static FieldType referenceType(String where, String typeLabel, Map<String, DomainFieldType> fieldTypes,
                                           Map<String, Map<String, Object>> models) {
        String target = typeLabel.substring(MODEL_REFERENCE_PREFIX.length());
        if (!MODEL_NAME.matcher(target).matches()) {
            throw new IllegalArgumentException("Property '" + where + "' has an invalid model reference '" + typeLabel
                    + "' (expected '#ModelName' with an upper-case model name).");
        }
        if (!models.containsKey(target)) {
            throw new IllegalArgumentException("Property '" + where + "' references unknown model '" + typeLabel
                    + "' (declare the model in this domain).");
        }
        return keyType(target, fieldTypes, models, new LinkedHashSet<>());
    }

    private static FieldType keyType(String modelName, Map<String, DomainFieldType> fieldTypes,
                                     Map<String, Map<String, Object>> models, Set<String> seen) {
        if (!seen.add(modelName)) return FieldType.STRING;
        Map<String, Object> model = models.get(modelName);
        if (model == null) return FieldType.STRING;
        List<?> properties = list(model.get("properties"));
        Map<String, Object> key = null;
        for (Object raw : properties) {
            Map<String, Object> p = mapOf(raw);
            if (bool(p.get("key"))) {
                key = p;
                break;
            }
        }
        if (key == null && !properties.isEmpty()) key = mapOf(properties.get(0));
        String label = key != null ? str(key, "type") : null;
        if (label == null) return FieldType.STRING;
        FieldType builtin = FieldType.fromLabelOrNull(label);
        if (builtin != null) return builtin;
        if (label.startsWith(MODEL_REFERENCE_PREFIX)) {
            return keyType(label.substring(MODEL_REFERENCE_PREFIX.length()), fieldTypes, models, seen);
        }
        DomainFieldType macro = fieldTypes.get(label);
        return macro != null ? macro.type() : FieldType.STRING;
    }

    private static Property parseProperty(String modelName, Map<String, Object> property,
                                          Map<String, DomainFieldType> fieldTypes,
                                          Map<String, Map<String, Object>> models) {
        String propertyName = str(property, "name");
        String typeLabel = str(property, "type");
        if (propertyName == null || typeLabel == null) {
            throw new IllegalArgumentException("Property requires a 'name' and a 'type'.");
        }
        DomainFieldType macro = null;
        FieldType type = FieldType.fromLabelOrNull(typeLabel);
        if (type == null && typeLabel.startsWith(MODEL_REFERENCE_PREFIX)) {
            type = referenceType(modelName + "." + propertyName, typeLabel, fieldTypes, models);
        } else if (type == null) {
            macro = fieldTypes.get(typeLabel);
            if (macro == null) {
                throw new IllegalArgumentException("Unknown field type: '" + typeLabel
                        + "' (declare it under defaults.fields or use a builtin type).");
            }
            type = macro.type();
        }
        Property.Builder builder = Property.builder(propertyName, type)
                .required(bool(property.get("required")))
                .key(bool(property.get("key")))
                .list(bool(property.get("list")) || (macro != null && macro.list()))
                .description(str(property, "description"));
        String authorityLabel = str(property, "authority");
        if (authorityLabel != null) {
            builder.authority(ModelAuthority.fromString(authorityLabel));
        }
        if (macro != null) {
            for (Rule rule : macro.rules()) {
                addRule(builder, rule);
            }
        }
        for (Object rawRule : list(property.get("rules"))) {
            addRule(builder, parseRule(mapOf(rawRule)));
        }
        if (bool(property.get("immutable"))) {
            builder.immutable(true);
        }
        return builder.build();
    }

    /**
     * Adds one declared rule to a property. {@code immutable} is DRef's own marker, not a
     * rule a value can pass or fail: it sets {@link Property#isImmutable()} and stays out of
     * the rules handed to regl, which has no such rule and would refuse the property.
     */
    private static void addRule(Property.Builder builder, Rule rule) {
        if (IMMUTABLE_RULE.equals(rule.code())) {
            builder.immutable(true);
        } else {
            builder.addRule(rule);
        }
    }

    private static Rule parseRule(Map<String, Object> rule) {
        String code = str(rule, "type");
        if (code == null) {
            throw new IllegalArgumentException("Rule requires a 'type'.");
        }
        Object param = normalizeIntegralNumbers(rule.get("param"));
        String description = str(rule, "description");
        // DRef states severity per rule, as regl does; regl's constructor still
        // takes the boolean, so `warn` (or legacy warnOnly: true) is what becomes warnOnly there.
        Object severityValue = rule.get("severity");
        if (severityValue != null && !"error".equals(severityValue) && !"warn".equals(severityValue)) {
            throw new IllegalArgumentException("Rule severity must be 'error' or 'warn', got '"
                    + severityValue + "'.");
        }
        boolean warnOnly = "warn".equals(severityValue)
                || Boolean.TRUE.equals(rule.get("warnOnly"))
                || "true".equalsIgnoreCase(String.valueOf(rule.get("warnOnly")));

        RuleType builtIn = RuleType.fromCodeOrNull(code);
        if (builtIn != null && builtIn.parameterType() == ParameterType.OBJECT && !(param instanceof Range) && param != null) {
            param = parseRange(mapOf(param));
        }
        return Rule.custom(code, param, description, warnOnly);
    }

    /**
     * JSON libraries deserialize whole numbers as {@link Double}/{@link Float}
     * (e.g. Gson yields {@code 100.0} for {@code 100}). Rule parameters
     * are validated against the evaluator's declared type (e.g. {@code Integer}
     * for {@code maxLength}), so integral numeric params are normalized to
     * {@code Integer}.
     */
    static Object normalizeIntegralNumbers(Object param) {
        if (param instanceof Double d) {
            if (d == Math.rint(d) && !d.isInfinite(d) && d >= Integer.MIN_VALUE && d <= Integer.MAX_VALUE) {
                return d.intValue();
            }
        } else if (param instanceof Float f) {
            if (f == Math.rint(f) && !f.isInfinite(f) && f >= Integer.MIN_VALUE && f <= Integer.MAX_VALUE) {
                return f.intValue();
            }
        }
        return param;
    }

    /**
     * Parses a Mapping Definition — the {@code name}/{@code provider}/{@code version}/
     * {@code description}/{@code fields} object described in the specification
     * (§6.1, §6.2) — into a {@link MappingDefinition}.
     *
     * <p>This is the same parser used for a model's {@code mapsFrom} entries, so a
     * definition obtained here is indistinguishable from one embedded in a domain
     * document. Callers that hold a mapping definition outside a domain document
     * (an orchestrator binding an external payload to a known model, say) parse it
     * here rather than reimplementing the field and transform vocabulary, which
     * would drift from the catalog.
     *
     * <p>The returned definition carries no target model: in the specification a
     * mapping is embedded in the model it imports onto. A caller that needs a target
     * supplies it to {@link DrefMapper} and {@link DrefValidator} separately.
     *
     * @throws IllegalArgumentException if {@code name} is absent, a field mapping has
     *         no {@code from}, a multi-field {@code from} has no {@code to}, or a
     *         transform type or parameter is not in the catalog.
     */
    public static MappingDefinition parseMapping(Map<String, Object> mapping) {
        String mappingName = str(mapping, "name");
        if (mappingName == null) {
            throw new IllegalArgumentException("Mapping definition requires a 'name'.");
        }
        MappingDefinition.Builder builder = MappingDefinition.builder(mappingName)
                .provider(str(mapping, "provider"))
                .version(str(mapping, "version"))
                .description(str(mapping, "description"));
        for (Object field : list(mapping.get("fields"))) {
            if (field instanceof String s) {
                builder.field(s);
            } else {
                Map<String, Object> fieldMap = mapOf(field);
                Object rawFrom = fieldMap == null ? null : fieldMap.get("from");
                if (rawFrom == null) {
                    throw new IllegalArgumentException("Field mapping requires a 'from'.");
                }
                String to = str(fieldMap, "to");
                List<Transform> transforms = new ArrayList<>();
                for (Object step : list(fieldMap.get("transform"))) {
                    if (step instanceof String stepName) {
                        transforms.add(new Transform(TransformType.fromCode(stepName)));
                    } else {
                        Map<String, Object> stepMap = mapOf(step);
                        TransformType type = TransformType.fromCode(str(stepMap, "type"));
                        transforms.add(new Transform(type, stepMap.get("param")));
                    }
                }
                if (rawFrom instanceof List<?> fromList) {
                    String[] names = fromList.stream().map(String::valueOf).toArray(String[]::new);
                    FieldMapping.Builder fieldBuilder = FieldMapping.multiFrom(names).to(to);
                    for (Transform transform : transforms) {
                        fieldBuilder.add(transform);
                    }
                    builder.field(fieldBuilder.build());
                } else {
                    builder.field(String.valueOf(rawFrom), to, transforms);
                }
            }
        }
        return builder.build();
    }

    private static Range parseRange(Map<String, Object> map) {
        if (map == null) return null;
        return new Range(intOf(map.get("min")), intOf(map.get("max")));
    }

    // ------------------------------------------------------------------ map helpers

    @SuppressWarnings("unchecked")
    private static Map<String, Object> mapOf(Object value) {
        return value instanceof Map<?, ?> m ? (Map<String, Object>) m : null;
    }

    @SuppressWarnings("unchecked")
    private static List<Object> list(Object value) {
        return value instanceof List<?> l ? (List<Object>) l : List.of();
    }

    private static String str(Map<String, Object> map, String key) {
        if (map == null) return null;
        Object value = map.get(key);
        return value instanceof String s ? s : value != null ? String.valueOf(value) : null;
    }

    private static boolean bool(Object value) {
        return Boolean.TRUE.equals(value);
    }

    private static Integer intOf(Object value) {
        return value instanceof Number n ? n.intValue() : null;
    }

    public static class Builder {
        private String name;
        private String version = null;
        private String description = null;
        private DomainDefaults defaults = null;
        private final List<DomainScope> scopes = new ArrayList<>();
        private final List<DomainModel> models = new ArrayList<>();

        public Builder(String name) {
            this.name = name;
        }

        public Builder name(String name) { this.name = name; return this; }
        public Builder version(String version) { this.version = version; return this; }
        public Builder description(String description) { this.description = description; return this; }
        public Builder defaults(DomainDefaults defaults) { this.defaults = defaults; return this; }
        public Builder formats(Formats formats) { this.defaults = DomainDefaults.of(formats); return this; }
        public Builder scope(DomainScope scope) { this.scopes.add(scope); return this; }
        public Builder model(DomainModel model) { this.models.add(model); return this; }

        public DrefDomain build() {
            return new DrefDomain(name, version, description, defaults, scopes, models);
        }
    }

    /** Raw {@code defaults.fields} declaration before resolution to a builtin-backed {@link DomainFieldType}. */
    private record RawFieldType(String typeLabel, boolean list, List<Rule> rules) {}
}