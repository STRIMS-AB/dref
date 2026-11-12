package dev.dref;

import dev.regl.Rule;
import dev.regl.RuleType;
import dev.regl.TargetType;
import dev.regl.ParameterType;
import dev.regl.ValidationResult;
import dev.regl.ValidationError;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.time.temporal.TemporalAccessor;
import java.util.*;
import java.util.function.Consumer;
import java.util.regex.Pattern;

public class DrefValidator {

    private static final Pattern MODEL_NAME_PATTERN = Pattern.compile("^[A-Z][a-zA-Z0-9_]*$");
    private static final Pattern SCOPE_NAME_PATTERN = Pattern.compile("^[a-z0-9_-]+$");

    /**
     * Validates domain model definition itself (name, optional scope reference,
     * cardinality, unique property names, mapping definitions).
     */
    public static ValidationResult validateModel(DomainModel model) {
        List<ValidationError> errors = new ArrayList<>();

        if (model.name() == null || !MODEL_NAME_PATTERN.matcher(model.name()).matches()) {
            errors.add(new ValidationError("name", "pattern", null, "Model name must be PascalCase alphanumeric (e.g. 'Customer', 'PaymentIntent')."));
        }

        if (model.scope() != null && !SCOPE_NAME_PATTERN.matcher(model.scope()).matches()) {
            errors.add(new ValidationError("scope", "pattern", null, "Model scope must be a lowercase kebab-case scope identifier (e.g. 'catalog', 'orders')."));
        }

        Set<String> propertyNames = new HashSet<>();
        for (Property prop : model.properties()) {
            if (!propertyNames.add(prop.name())) {
                errors.add(new ValidationError(prop.name(), "duplicateProperty", null, "Duplicate property name in model: " + prop.name()));
            }
        }

        Map<String, FieldType> propTypes = new LinkedHashMap<>();
        for (Property prop : model.properties()) {
            propTypes.putIfAbsent(prop.name(), prop.type());
        }
        for (Property prop : model.properties()) {
            for (Rule c : prop.rules()) {
                ValidationError refError = fieldRefError(c, prop, propTypes);
                if (refError != null) {
                    errors.add(refError);
                }
            }
        }

        if (model.classify() == ModelType.ENTITY
                && model.properties().stream().noneMatch(Property::key)) {
            errors.add(new ValidationError("key", "required",
                    "Entity model '" + model.name() + "' must declare at least one key property."));
        }

        for (MappingDefinition mapping : model.mapsFrom()) {
            errors.addAll(validateMappingDefinition(mapping).errors());
        }

        return ValidationResult.of(errors);
    }

    /**
     * Validates a cross-field reference parameter ("$fieldName"): the target
     * must name another property of the same model (never the constrained
     * property itself) whose field type is compatible with the rule's
     * parameter type. Returns the error to report, or {@code null} when the
     * reference is valid (or the rule carries no reference).
     */
    private static boolean isFieldRef(Object param) {
        return param instanceof String s && s.startsWith("$") && s.length() > 1;
    }

    private static ValidationError fieldRefError(Rule c, Property prop, Map<String, FieldType> propTypes) {
        // regl renamed a rule's parameter accessor param() -> value() when it
        // settled that the argument and the document value are different things.
        if (!isFieldRef(c.value())) {
            return null;
        }
        String target = ((String) c.value()).substring(1);
        if (target.isEmpty()) {
            return new ValidationError(prop.name(), "fieldRef",
                    "Rule '" + c.code() + "' on '" + prop.name() + "' has an empty field reference.");
        }
        if (!propTypes.containsKey(target)) {
            return new ValidationError(prop.name(), "unknownFieldRef",
                    "Rule '" + c.code() + "' on '" + prop.name() + "' references unknown property '" + target + "'.");
        }
        if (target.equals(prop.name())) {
            return new ValidationError(prop.name(), "selfFieldRef",
                    "Rule '" + c.code() + "' on '" + prop.name() + "' must not reference the property itself.");
        }
        RuleType builtIn = RuleType.fromCodeOrNull(c.code());
        if (builtIn == null) {
            return null; // custom rule: its parameter type is not known here
        }
        ParameterType expected = builtIn.parameterType();
        FieldType targetType = propTypes.get(target);
        boolean compatible = (expected == ParameterType.NUMBER && targetType == FieldType.NUMBER)
                || (expected == ParameterType.STRING && targetType == FieldType.STRING)
                || (expected == ParameterType.BOOLEAN && targetType == FieldType.BOOLEAN);
        if (!compatible) {
            return new ValidationError(prop.name(), "fieldRefType",
                    "Rule '" + c.code() + "' expects a " + expected + " parameter, but property '" + target + "' is a " + targetType + ".");
        }
        return null;
    }

    /**
     * Validates a mapping definition: name presence and unique source fields.
     */
    public static ValidationResult validateMappingDefinition(MappingDefinition mapping) {
        if (mapping == null || mapping.name() == null || mapping.name().isBlank()) {
            return ValidationResult.invalid(List.of(
                    new ValidationError("name", "required", null, "Mapping definition requires a name.")));
        }
        List<ValidationError> errors = new ArrayList<>();
        Set<String> sourceFields = new HashSet<>();
        for (FieldMapping field : mapping.fields()) {
            for (String sourceProperty : field.sourceProperties()) {
                if (!sourceFields.add(sourceProperty)) {
                    errors.add(new ValidationError(sourceProperty, "duplicateFrom",
                            "Duplicate source field in mapping: " + sourceProperty));
                }
            }
        }
        return ValidationResult.of(errors);
    }

    /**
     * Validates a full Domain Document: its configuration (name, default formats),
     * duplicate scope names, duplicate model names (domain-wide), each model, that
     * each model's optional scope reference targets a declared scope, and every
     * embedded mapping definition.
     */
    public static ValidationResult validateDomain(DrefDomain domain) {
        List<ValidationError> errors = new ArrayList<>();
        List<ValidationError> warnings = new ArrayList<>();

        if (domain.name() == null || domain.name().isBlank()) {
            errors.add(new ValidationError("name", "required", null, "Domain document must have a name."));
        }

        Formats formats = domain.formats();
        checkFormat("date", formats.date(), errors);
        checkFormat("time", formats.time(), errors);
        checkFormat("dateTime", formats.dateTime(), errors);

        Set<String> scopeNames = new HashSet<>();
        for (DomainScope scope : domain.scopes()) {
            if (!scopeNames.add(scope.name())) {
                errors.add(new ValidationError("scopes", "duplicateScope", null, "Duplicate scope name: " + scope.name()));
            }
        }

        Set<String> modelNames = new HashSet<>();
        for (DomainModel model : domain.models()) {
            if (model.name() != null && !modelNames.add(model.name())) {
                errors.add(new ValidationError(model.name(), "duplicateModel", null, "Duplicate model name within domain: " + model.name()));
            }
            if (model.scope() != null && !scopeNames.contains(model.scope())) {
                errors.add(new ValidationError(model.name(), "unknownScope", null, "Model '" + model.name() + "' references unknown scope '" + model.scope() + "'."));
            }
            ValidationResult modelResult = validateModel(model);
            errors.addAll(modelResult.errors());
            warnings.addAll(modelResult.warnings());
            for (MappingDefinition mapping : model.mapsFrom()) {
                ValidationResult mappingResult = validateMappingDefinition(mapping);
                errors.addAll(mappingResult.errors());
                warnings.addAll(mappingResult.warnings());
            }
        }

        return ValidationResult.of(errors, warnings);
    }

    private static void checkFormat(String kind, String value, List<ValidationError> errors) {
        if (value != null && value.isBlank()) {
            errors.add(new ValidationError("defaults.formats." + kind, "pattern",
                    "defaults.formats." + kind + " must be a non-empty format string."));
        }
    }

    /**
     * Validates a domain model definition and throws a {@link DrefValidationException} when it is invalid.
     */
    public static void validateModelOrThrow(DomainModel model) {
        ValidationResult result = validateModel(model);
        throwIfInvalid(result);
    }

    /**
     * Validates a record instance map against a domain model.
     */
    public static ValidationResult validateInstance(Map<String, Object> data, DomainModel model) {
        return validateInstance(data, model, (Formats) null);
    }

    /**
     * Validates a record instance map against a domain model. Invokes {@code onInvalid}
     * with the failed result when validation does not pass (the result is still returned).
     */
    public static ValidationResult validateInstance(Map<String, Object> data, DomainModel model, Consumer<ValidationResult> onInvalid) {
        ValidationResult result = validateInstance(data, model);
        if (!result.isValid()) {
            onInvalid.accept(result);
        }
        return result;
    }

    /**
     * Validates a record instance map against a domain model, throwing a
     * {@link DrefValidationException} when validation does not pass.
     */
    public static void validateInstanceOrThrow(Map<String, Object> data, DomainModel model) {
        throwIfInvalid(validateInstance(data, model));
    }

    /**
     * Validates a POJO instance against a domain model by introspecting its
     * getters ({@code getX()}/{@code isX()} and record accessors) and matching
     * the values against the model properties. Maps are handled through the
     * map overload.
     */
    public static ValidationResult validateInstance(Object instance, DomainModel model) {
        if (instance == null) {
            return ValidationResult.invalid(List.of(
                    new ValidationError(model.name(), "required", null, "Instance cannot be null.")));
        }
        if (instance instanceof Map<?, ?> raw) {
            Map<String, Object> data = new HashMap<>();
            raw.forEach((k, v) -> data.put(String.valueOf(k), v));
            return validateInstance(data, model);
        }

        Map<String, Object> values = readPojoValues(instance);
        return validateInstance(values, model);
    }

    /**
     * Validates a POJO instance against a domain model by introspection. Invokes
     * {@code onInvalid} with the failed result when validation does not pass.
     */
    public static ValidationResult validateInstance(Object instance, DomainModel model, Consumer<ValidationResult> onInvalid) {
        ValidationResult result = validateInstance(instance, model);
        if (!result.isValid()) {
            onInvalid.accept(result);
        }
        return result;
    }

    /**
     * Validates a POJO instance against a domain model by introspection, throwing
     * a {@link DrefValidationException} when validation does not pass.
     */
    public static void validateInstanceOrThrow(Object instance, DomainModel model) {
        throwIfInvalid(validateInstance(instance, model));
    }

    /**
     * Validates a record instance map written by a specific principal
     * ({@code client}, {@code internal} or {@code external}). Runs the full
     * authority-agnostic instance validation (see {@link #validateInstance(Map, DomainModel)}),
     * then additionally fails every property present in the payload whose effective
     * authority (its own {@link Property#authority()}, falling back to the model's)
     * does not match {@code writer}. Properties the payload does not set are
     * unrestricted; a {@code null} writer skips the authority check.
     */
    public static ValidationResult validateWrite(Map<String, Object> data, DomainModel model, ModelAuthority writer) {
        if (data == null) {
            return ValidationResult.invalid(List.of(new ValidationError(model.name(), "required", null, "Instance data map cannot be null.")));
        }
        ValidationResult base = validateInstance(data, model);
        if (writer == null) {
            return base;
        }
        List<ValidationError> errors = new ArrayList<>(base.errors());
        List<ValidationError> warnings = new ArrayList<>(base.warnings());
        checkWriteAuthority(data, model, writer, errors);
        return ValidationResult.of(errors, warnings);
    }

    /**
     * Validates a record instance map written by a specific principal, invoking
     * {@code onInvalid} with the failed result when validation does not pass.
     */
    public static ValidationResult validateWrite(Map<String, Object> data, DomainModel model, ModelAuthority writer, Consumer<ValidationResult> onInvalid) {
        ValidationResult result = validateWrite(data, model, writer);
        if (!result.isValid()) {
            onInvalid.accept(result);
        }
        return result;
    }

    /**
     * Validates a record instance map written by a specific principal, throwing a
     * {@link DrefValidationException} when validation does not pass.
     */
    public static void validateWriteOrThrow(Map<String, Object> data, DomainModel model, ModelAuthority writer) {
        throwIfInvalid(validateWrite(data, model, writer));
    }

    /**
     * Validates a POJO (or map) instance written by a specific principal. Maps are
     * handled through the map overload; POJOs are introspected by getters.
     */
    public static ValidationResult validateWrite(Object instance, DomainModel model, ModelAuthority writer) {
        if (instance == null) {
            return ValidationResult.invalid(List.of(
                    new ValidationError(model.name(), "required", null, "Instance cannot be null.")));
        }
        if (instance instanceof Map<?, ?> raw) {
            Map<String, Object> data = new HashMap<>();
            raw.forEach((k, v) -> data.put(String.valueOf(k), v));
            return validateWrite(data, model, writer);
        }
        Map<String, Object> values = readPojoValues(instance);
        ValidationResult base = validateInstance(instance, model);
        if (writer == null) {
            return base;
        }
        List<ValidationError> errors = new ArrayList<>(base.errors());
        List<ValidationError> warnings = new ArrayList<>(base.warnings());
        checkWriteAuthority(values, model, writer, errors);
        return ValidationResult.of(errors, warnings);
    }

    /**
     * Validates a POJO instance written by a specific principal, invoking
     * {@code onInvalid} with the failed result when validation does not pass.
     */
    public static ValidationResult validateWrite(Object instance, DomainModel model, ModelAuthority writer, Consumer<ValidationResult> onInvalid) {
        ValidationResult result = validateWrite(instance, model, writer);
        if (!result.isValid()) {
            onInvalid.accept(result);
        }
        return result;
    }

    /**
     * Validates a POJO instance written by a specific principal, throwing a
     * {@link DrefValidationException} when validation does not pass.
     */
    public static void validateWriteOrThrow(Object instance, DomainModel model, ModelAuthority writer) {
        throwIfInvalid(validateWrite(instance, model, writer));
    }

    private static void checkWriteAuthority(Map<String, Object> data, DomainModel model, ModelAuthority writer, List<ValidationError> errors) {
        for (Property property : model.properties()) {
            if (!data.containsKey(property.name())) {
                continue;
            }
            ModelAuthority effective = property.authority() != null ? property.authority() : model.authority();
            if (effective == null) {
                effective = ModelAuthority.INTERNAL;
            }
            if (effective != writer) {
                errors.add(new ValidationError(property.name(), "authority",
                        "Property '" + property.name() + "' is " + effective.getValue()
                                + "-authored and cannot be written by '" + writer.getValue() + "'."));
            }
        }
    }

    /**
     * Validates a POJO instance whose class is annotated with {@link Model},
     * {@link Property} and the rule annotations. The model is derived
     * from the class with {@link DrefModel#build(Class)} and the instance
     * validated in a single call.
     */
    public static ValidationResult validateInstance(Object annotatedInstance) {
        if (annotatedInstance == null) {
            throw new IllegalArgumentException("annotatedInstance must not be null.");
        }
        DomainModel model = DrefModel.build(annotatedInstance.getClass());
        return validateInstance(annotatedInstance, model);
    }

    /**
     * Validates an annotated POJO instance, invoking {@code onInvalid} with the
     * failed result when validation does not pass.
     */
    public static ValidationResult validateInstance(Object annotatedInstance, Consumer<ValidationResult> onInvalid) {
        ValidationResult result = validateInstance(annotatedInstance);
        if (!result.isValid()) {
            onInvalid.accept(result);
        }
        return result;
    }

    /**
     * Validates an annotated POJO instance, throwing a {@link DrefValidationException}
     * when validation does not pass.
     */
    public static void validateInstanceOrThrow(Object annotatedInstance) {
        throwIfInvalid(validateInstance(annotatedInstance));
    }

    /**
     * Validates a record instance map against a domain model, additionally checking
     * that any temporal values match the domain's {@link Formats} for that field type:
     * {@code String} values of token/ISO formats are lexically checked, whole-number
     * epoch values are allowed for the {@code epoch} and {@code epochMillis} named
     * formats, and a wrong form is reported.
     */
    private record SchemaKey(DomainModel model, Formats formats) {}
    private static final Map<SchemaKey, dev.regl.Schema> SCHEMA_CACHE = new java.util.concurrent.ConcurrentHashMap<>();

    private static dev.regl.Schema getReglSchema(DomainModel model, Formats domainFormats) {
        return SCHEMA_CACHE.computeIfAbsent(new SchemaKey(model, domainFormats), key -> {
            DomainModel m = key.model();
            Formats formats = key.formats();
            dev.regl.Schema schema = dev.regl.Schema.create();
            for (Property p : m.properties()) {
                Fixed fixed = reglFieldFor(p, formats);
                List<dev.regl.Rule> fixedRules = fixed.rules();
                dev.regl.TargetType targetType = fixed.type();

                if (p.list()) {
                    schema = schema.field(p.name() + ".*", dev.regl.Field.of(targetType, fixedRules));
                    if (p.required()) {
                         schema = schema.field(p.name(), dev.regl.Rules.list().notNull());
                    } else {
                         schema = schema.field(p.name(), dev.regl.Rules.list());
                    }
                } else {
                    schema = schema.field(p.name(), dev.regl.Field.of(targetType, fixedRules));
                }
            }
            return schema;
        });
    }

    public static ValidationResult validateInstance(Map<String, Object> data, DomainModel model, Formats domainFormats) {
        if (data == null) {
            return ValidationResult.invalid(List.of(new ValidationError(model.name(), "required", null, "Instance data map cannot be null.")));
        }

        List<ValidationError> errors = new ArrayList<>();
        List<ValidationError> warnings = new ArrayList<>();

        // Delegate 100% of field-level rule validation (including cross-field refs, types, and temporal formats) to regl
        dev.regl.Schema reglSchema = getReglSchema(model, domainFormats);
        dev.regl.DocumentResult reglResult = reglSchema.validate(data);
        for (dev.regl.DocumentFinding finding : reglResult.errors()) {
            errors.add(new ValidationError(finding.path(), finding.kind().name(), null, finding.message()));
        }
        for (dev.regl.DocumentFinding finding : reglResult.warnings()) {
            warnings.add(new ValidationError(finding.path(), finding.kind().name(), null, finding.message()));
        }

        return ValidationResult.of(errors, warnings);
    }

    /**
     * Validates a POJO instance against a domain model with domain formats. When
     * the value is a temporal {@link String} its lexical format is checked against
     * the {@link Formats} declared by the domain for that field type.
     */
    public static ValidationResult validateInstance(Object instance, DomainModel model, Formats domainFormats) {
        if (instance == null) {
            return ValidationResult.invalid(List.of(
                    new ValidationError(model.name(), "required", null, "Instance cannot be null.")));
        }
        if (instance instanceof Map<?, ?> raw) {
            Map<String, Object> map = new HashMap<>();
            raw.forEach((k, v) -> map.put(String.valueOf(k), v));
            return validateInstance(map, model, domainFormats);
        }

        Map<String, Object> values = readPojoValues(instance);
        return validateInstance(values, model, domainFormats);
    }

    /** A property's regl target type together with the rules regl should carry for it. */
    private record Fixed(TargetType type, List<Rule> rules) {}

    /**
     * Translates one DRef property into the regl field it becomes: required becomes
     * {@code notNull}, the property's own rules are carried across unchanged, and a
     * temporal property gains whatever the declared domain format implies.
     *
     * <p>Instance validation and single-property validation must agree, so both call
     * this rather than deriving the type separately. They did once, and only one of
     * the two copies got corrected when regl moved the epoch rules to DATETIME.
     */
    private static Fixed reglFieldFor(Property p, Formats formats) {
        List<Rule> rules = new ArrayList<>();
        if (p.required()) {
            rules.add(new Rule(RuleType.NOT_NULL, null));
        }
        rules.addAll(p.rules());

        boolean isEpoch = false;
        if (formats != null && isTemporal(p.type())) {
            String fmt = formats.forType(p.type());
            if (Formats.EPOCH_MILLIS.equalsIgnoreCase(fmt)) {
                rules.add(new Rule(RuleType.EPOCH_MILLIS));
                isEpoch = true;
            } else if (Formats.EPOCH.equalsIgnoreCase(fmt)) {
                rules.add(new Rule(RuleType.EPOCH));
                isEpoch = true;
            } else if (Formats.ISO_8601.equalsIgnoreCase(fmt)) {
                switch (p.type()) {
                    case DATE -> rules.add(new Rule(RuleType.ISO_DATE));
                    case TIME -> rules.add(new Rule(RuleType.ISO_TIME));
                    default -> rules.add(new Rule(RuleType.ISO_DATE_TIME));
                }
            } else if (fmt != null && !fmt.isBlank()) {
                rules.add(new Rule(RuleType.DATE_FORMAT, fmt));
            }
        }

        // An epoch field is an instant, not a bare number: epoch and epochMillis
        // target DATETIME, which admits a whole number, so declaring NUMBER here
        // would make Field.of reject the rule.
        TargetType type;
        if (isEpoch) {
            type = TargetType.DATETIME;
        } else {
            type = switch (p.type()) {
                case STRING, DATE, DATETIME, TIME -> TargetType.STRING;
                case NUMBER -> TargetType.NUMBER;
                case INTEGER -> TargetType.INTEGER;
                case BOOLEAN -> TargetType.BOOLEAN;
                case INFERRED -> TargetType.ANY;
            };
        }
        return new Fixed(type, rules);
    }

    private static boolean isTemporal(FieldType type) {
        return type == FieldType.DATE || type == FieldType.DATETIME || type == FieldType.TIME;
    }

    private static void throwIfInvalid(ValidationResult result) {
        if (!result.isValid()) {
            throw new DrefValidationException(result);
        }
    }

    private static Map<String, Object> readPojoValues(Object instance) {
        Map<String, Object> values = new LinkedHashMap<>();
        Class<?> type = instance.getClass();

        for (Method method : type.getMethods()) {
            if (Modifier.isStatic(method.getModifiers())
                    || method.getParameterCount() != 0
                    || method.getReturnType() == void.class) {
                continue;
            }
            String key = beanName(method, type);
            if (key == null) {
                continue;
            }
            try {
                if (!method.canAccess(instance)) {
                    method.setAccessible(true);
                }
                values.put(key, method.invoke(instance));
            } catch (Exception e) {
                throw new IllegalArgumentException(
                        "Cannot read getter '" + method.getName() + "' on " + type.getName() + ".", e);
            }
        }

        // Public fields as a fallback for members without a getter.
        for (Class<?> c = type; c != null && c != Object.class; c = c.getSuperclass()) {
            for (Field field : c.getDeclaredFields()) {
                if (Modifier.isStatic(field.getModifiers()) || !Modifier.isPublic(field.getModifiers())) {
                    continue;
                }
                if (values.containsKey(field.getName())) {
                    continue;
                }
                try {
                    values.put(field.getName(), field.get(instance));
                } catch (Exception e) {
                    throw new IllegalArgumentException(
                            "Cannot read field '" + field.getName() + "' on " + type.getName() + ".", e);
                }
            }
        }

        applyPropertyRenames(type, values);
        return values;
    }

    /**
     * When a member declares {@code @Property(name = "...")} that renames the
     * property, expose the introspected value under the annotated (model)
     * property name as well.
     */
    private static void applyPropertyRenames(Class<?> type, Map<String, Object> values) {
        for (Class<?> c = type; c != null && c != Object.class; c = c.getSuperclass()) {
            for (Field field : c.getDeclaredFields()) {
                renameAlias(values, field.getAnnotation(dev.dref.annotation.Property.class), field.getName());
            }
        }
        for (Method method : type.getMethods()) {
            String bean = beanName(method, type);
            if (bean != null) {
                renameAlias(values, method.getAnnotation(dev.dref.annotation.Property.class), bean);
            }
        }
    }

    private static void renameAlias(Map<String, Object> values, dev.dref.annotation.Property property, String beanKey) {
        if (property == null || property.name().isBlank() || property.name().equals(beanKey)) {
            return;
        }
        if (values.containsKey(beanKey)) {
            values.put(property.name(), values.get(beanKey));
        }
    }

    private static String beanName(Method method, Class<?> type) {
        String name = method.getName();
        if (name.startsWith("get")
                && name.length() > 3
                && Character.isUpperCase(name.charAt(3))) {
            return decapitalize(name.substring(3));
        }
        if (name.startsWith("is")
                && name.length() > 2
                && Character.isUpperCase(name.charAt(2))
                && (method.getReturnType() == boolean.class || method.getReturnType() == Boolean.class)) {
            return decapitalize(name.substring(2));
        }
        if (type.isRecord() && method.getDeclaringClass() == type) {
            for (var component : type.getRecordComponents()) {
                if (component.getName().equals(name) && component.getAccessor().equals(method)) {
                    return name;
                }
            }
        }
        return null;
    }

    private static String decapitalize(String s) {
        return s.isEmpty() ? s : Character.toLowerCase(s.charAt(0)) + s.substring(1);
    }

    /**
     * Validates a single property value against property rules.
     * Delegates all rule evaluation to regl.
     */
    public static ValidationResult validateProperty(Object value, Property property) {
        return validateProperty(value, property, null);
    }

    /**
     * As {@link #validateProperty(Object, Property)}, but domain-format aware: temporal
     * properties whose domain declares an epoch format accept whole {@link Number} values.
     */
    public static ValidationResult validateProperty(Object value, Property property, Formats domainFormats) {
        List<ValidationError> errors = new ArrayList<>();
        List<ValidationError> warnings = new ArrayList<>();
        String field = property.name();

        Fixed fixed = reglFieldFor(property, domainFormats);
        List<Rule> fixedRules = fixed.rules();
        dev.regl.TargetType targetType = fixed.type();

        dev.regl.Schema schema;
        if (property.list()) {
            schema = dev.regl.Schema.create()
                    .field(field + ".*", dev.regl.Field.of(targetType, fixedRules));
            if (property.required()) {
                schema = schema.field(field, dev.regl.Rules.list().notNull());
            } else {
                schema = schema.field(field, dev.regl.Rules.list());
            }
        } else {
            schema = dev.regl.Schema.create()
                    .field(field, dev.regl.Field.of(targetType, fixedRules));
        }

        Map<String, Object> doc = Map.of(field, value != null ? value : new Object() {
            @Override public String toString() { return "null"; }
        });
        if (value == null) {
            doc = new HashMap<>();
            doc.put(field, null);
        }
        dev.regl.DocumentResult reglResult = schema.validate(doc);
        for (dev.regl.DocumentFinding f : reglResult.errors()) {
            errors.add(new ValidationError(f.path(), f.kind().name(), null, f.message()));
        }
        for (dev.regl.DocumentFinding f : reglResult.warnings()) {
            warnings.add(new ValidationError(f.path(), f.kind().name(), null, f.message()));
        }

        return ValidationResult.of(errors, warnings);
    }

    /**
     * Validates a single property value, throwing a {@link DrefValidationException}
     * when validation does not pass.
     */
    public static void validatePropertyOrThrow(Object value, Property property) {
        throwIfInvalid(validateProperty(value, property));
    }
}