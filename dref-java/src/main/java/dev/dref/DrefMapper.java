package dev.dref;

import dev.regl.ValidationError;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Applies a {@link MappingDefinition} to a foreign payload: reads each configured
 * field, runs its transform chain left to right, and assembles the target
 * instance map. It performs no validation of the incoming object — validating
 * it against its own model document is the caller's responsibility.
 */
public class DrefMapper {

    /**
     * Maps a foreign payload using only catalog transformations. A {@code custom}
     * transform in the document raises an IllegalArgumentException.
     */
    public static MappingResult map(Map<String, Object> source, MappingDefinition mapping) {
        return map(source, mapping, null, null, null);
    }

    /**
     * Maps a foreign payload. Custom transforms are resolved through {@code customResolver}
     * (e.g. a registered lambda keyed by the free-text parameter).
     */
    public static MappingResult map(
            Map<String, Object> source,
            MappingDefinition mapping,
            Function<String, Function<Object, Object>> customResolver
    ) {
        return map(source, mapping, customResolver, null, null);
    }

    /**
     * Maps a foreign payload. Custom transforms are resolved through {@code customResolver}.
     * {@code targetModel} and {@code domainFormats} tell the mapper which domain it is
     * importing into, so {@code formatDate} can emit the target model's format: the dref
     * domain {@code defaults.formats} selected by the mapped property's field type
     * (falling back to the ISO standard). Custom transforms are resolved through
     * {@code customResolver}.
     */
    public static MappingResult map(
            Map<String, Object> source,
            MappingDefinition mapping,
            Function<String, Function<Object, Object>> customResolver,
            DomainModel targetModel,
            Formats domainFormats
    ) {
        if (source == null) {
            return MappingResult.invalid(List.of(new ValidationError(
                    mapping.name(), "required",
                    "Foreign payload must be a non-null map. Validate it against its source model document first.")));
        }

        Map<String, Object> target = new LinkedHashMap<>();
        for (FieldMapping field : mapping.fields()) {
            Object value = readSource(source, field);
            String outputFormat = resolveOutputFormat(field.targetProperty(), targetModel, domainFormats);
            Object mapped = applyChain(value, field.transforms(), customResolver, outputFormat);
            target.put(field.targetProperty(), mapped);
        }
        return MappingResult.valid(target);
    }

    /**
     * Reads a mapping field's source value: a single {@code from} property
     * directly, or — for a multi-field mapping — the array of the source
     * properties' present values in declared order (absent/null sources are
     * skipped; when none is present the value is {@code null}, so the
     * transform chain passes it through untouched).
     */
    private static Object readSource(Map<String, Object> source, FieldMapping field) {
        if (!field.isMultiSource()) {
            return source.get(field.from());
        }
        List<Object> present = new ArrayList<>();
        for (String sourceProperty : field.sourceProperties()) {
            Object value = source.get(sourceProperty);
            if (value != null) {
                present.add(value);
            }
        }
        return present.isEmpty() ? null : present;
    }

    private static String resolveOutputFormat(String targetProperty, DomainModel targetModel, Formats domainFormats) {
        Formats formats = domainFormats != null ? domainFormats : Formats.ISO;
        if (targetModel != null) {
            for (Property property : targetModel.properties()) {
                if (property.name().equals(targetProperty)) {
                    return formats.outputSpec(property.type());
                }
            }
        }
        return formats.outputSpec(FieldType.DATETIME);
    }

    /**
     * Runs a transform chain left to right. Null passes through untouched except
     * through {@code default}, {@code constant} and {@code custom}.
     */
    public static Object applyChain(
            Object value,
            List<Transform> transforms,
            Function<String, Function<Object, Object>> customResolver
    ) {
        return applyChain(value, transforms, customResolver, Formats.ISO.dateTime());
    }

    private static Object applyChain(
            Object value,
            List<Transform> transforms,
            Function<String, Function<Object, Object>> customResolver,
            String outputFormat
    ) {
        Object current = value;
        for (Transform transform : transforms) {
            if (current == null
                    && transform.type() != TransformType.DEFAULT
                    && transform.type() != TransformType.CONSTANT
                    && transform.type() != TransformType.CUSTOM) {
                continue;
            }
            current = applyTransform(current, transform, customResolver, outputFormat);
        }
        return current;
    }

    public static Object applyTransform(Object value, Transform transform) {
        return applyTransform(value, transform, null);
    }

    public static Object applyTransform(
            Object value,
            Transform transform,
            Function<String, Function<Object, Object>> customResolver
    ) {
        return applyTransform(value, transform, customResolver, Formats.ISO.dateTime());
    }

    private static Object applyTransform(
            Object value,
            Transform transform,
            Function<String, Function<Object, Object>> customResolver,
            String outputFormat
    ) {
        TransformType type = transform.type();
        Object param = transform.param();

        // STRING
        if (value instanceof String str) {
            return switch (type) {
                case LOWER_CASE -> str.toLowerCase();
                case UPPER_CASE -> str.toUpperCase();
                case TRIM -> str.trim();
                case PREFIX -> param + str;
                case SUFFIX -> str + param;
                case STRIP_PREFIX -> str.startsWith((String) param) ? str.substring(((String) param).length()) : str;
                case STRIP_SUFFIX -> str.endsWith((String) param) ? str.substring(0, str.length() - ((String) param).length()) : str;
                case REPLACE -> replace(str, asMap(param));
                case SUBSTRING -> substring(str, asMap(param));
                default -> applyNonString(value, type, param, customResolver, str, outputFormat);
            };
        }

        return applyNonString(value, type, param, customResolver, value, outputFormat);
    }

    private static Object applyNonString(
            Object value,
            TransformType type,
            Object param,
            Function<String, Function<Object, Object>> customResolver,
            Object strValue,
            String outputFormat
    ) {
        return switch (type) {
            // COMMON
            case DEFAULT -> defaultValue(value, param);
            case CONSTANT -> param;
            case CUSTOM -> custom(value, (String) param, customResolver);
            // STRING (array-level)
            case JOIN -> joinList(value, param);
            // COERCION
            case TO_STRING -> strValue == null ? value : String.valueOf(strValue);
            case TO_NUMBER -> toNumber(value);
            case TO_BOOLEAN -> toBoolean(value);
            // TEMPORAL
            case FORMAT_DATE -> formatDate(value, param, outputFormat);
            // NUMBER
            case ABS -> value instanceof Number n ? Math.abs(n.doubleValue()) : value;
            case ROUND -> value instanceof Number n ? (double) Math.round(n.doubleValue()) : value;
            case ROUND_TO -> value instanceof Number n ? roundTo(n.doubleValue(), asInt(param, 0)) : value;
            case MULTIPLY -> value instanceof Number n ? n.doubleValue() * asDouble(param, 1) : value;
            case DIVIDE -> value instanceof Number n && asDouble(param, 1) != 0 ? n.doubleValue() / asDouble(param, 1) : value;
            // STRING transforms are no-ops on non-String values
            case LOWER_CASE, UPPER_CASE, TRIM, PREFIX, SUFFIX, STRIP_PREFIX, STRIP_SUFFIX, REPLACE, SUBSTRING -> value;
        };
    }

    /**
     * Joins an array value (the multi-field mapping input) into a string
     * separated by the parameter; null entries are skipped. Non-array values
     * pass through unchanged.
     */
    private static Object joinList(Object value, Object param) {
        if (!(value instanceof List<?> list)) {
            return value;
        }
        String separator = param == null ? "" : String.valueOf(param);
        StringBuilder joined = new StringBuilder();
        for (Object item : list) {
            if (item == null) {
                continue;
            }
            if (joined.length() > 0) {
                joined.append(separator);
            }
            joined.append(item);
        }
        return joined.toString();
    }

    private static String replace(String value, Map<String, Object> param) {
        String pattern = asString(param.get("pattern"), "");
        String replacement = asString(param.get("replacement"), "");
        if (pattern.isEmpty()) return value;
        return value.replaceAll(Pattern.quote(pattern), replacement);
    }

    private static String substring(String value, Map<String, Object> param) {
        int start = asInt(param.get("start"), 0);
        int end = asInt(param.get("end"), -1);
        if (start < 0 || start > value.length()) return value;
        return end >= 0 ? value.substring(start, Math.min(end, value.length())) : value.substring(start);
    }

    private static Object toNumber(Object value) {
        if (value instanceof Number) return value;
        if (value instanceof String s) {
            try {
                return Double.parseDouble(s.trim());
            } catch (NumberFormatException ignored) {
                return value;
            }
        }
        if (value instanceof Boolean b) return b ? 1 : 0;
        return value;
    }

    private static Object toBoolean(Object value) {
        if (value instanceof Boolean) return value;
        if (value instanceof Number n) return n.doubleValue() != 0;
        if (value instanceof String s) {
            String t = s.trim().toLowerCase();
            if (t.equals("true") || t.equals("1") || t.equals("yes")) return true;
            if (t.equals("false") || t.equals("0") || t.equals("no")) return false;
        }
        return value;
    }

    private static Object defaultValue(Object value, Object param) {
        if (value == null || (value instanceof String s && s.isBlank())) return param;
        return value;
    }

    private static Object custom(Object value, String reference, Function<String, Function<Object, Object>> resolver) {
        if (resolver == null) {
            throw new IllegalArgumentException(
                    "Custom transform '" + reference + "' requires a custom resolver to be supplied to DrefMapper.");
        }
        Function<Object, Object> fn = resolver.apply(reference);
        if (fn == null) {
            throw new IllegalArgumentException("No custom transform registered for: " + reference);
        }
        return fn.apply(value);
    }

    private static Object formatDate(Object value, Object param, String outputFormat) {
        String source = asString(param, "").trim();
        boolean unix = source.equalsIgnoreCase("unix");

        if (value instanceof Number n) {
            return epochToFormat(n.longValue(), outputFormat);
        }

        if (value instanceof String s) {
            if (unix || source.isBlank()) {
                try {
                    return epochToFormat((long) Double.parseDouble(s.trim()), outputFormat);
                } catch (NumberFormatException ignored) {
                    // fall through to string pattern parsing
                }
            }
            String fromPattern = source.isBlank() ? "YYYY-MM-DDTHH:mm:ssZ" : source;
            try {
                DateTimeFormatter from = DateTimeFormatter.ofPattern(Formats.drefToJavaPattern(fromPattern));
                Object parsed = from.parseBest(s.trim(), LocalDateTime::from, LocalDate::from);
                long epoch = parsed instanceof LocalDate ld
                        ? ld.atStartOfDay(ZoneOffset.UTC).toEpochSecond()
                        : ((LocalDateTime) parsed).toEpochSecond(ZoneOffset.UTC);
                return epochToFormat(epoch, outputFormat);
            } catch (Exception ignored) {
                return value;
            }
        }
        return value;
    }

    /**
     * Emits a temporal value in the resolved output format. {@code epoch} and
     * {@code epochMillis} outputs are whole numbers (Unix seconds / milliseconds);
     * any other format renders an ISO or dref-token pattern string.
     */
    private static Object epochToFormat(long raw, String outputFormat) {
        long epoch = Math.abs(raw) > 10_000_000_000L ? raw / 1000L : raw; // normalize milliseconds to seconds
        if (Formats.isEpochNamed(outputFormat)) {
            long value = Formats.isEpochMillisNamed(outputFormat) ? epoch * 1000L : epoch;
            return value;
        }
        if (Formats.ISO_8601.equalsIgnoreCase(outputFormat)) {
            outputFormat = Formats.ISO.dateTime(); // no field-type context here
        }
        DateTimeFormatter toFormat = DateTimeFormatter.ofPattern(Formats.drefToJavaPattern(outputFormat));
        return Instant.ofEpochSecond(epoch).atZone(ZoneOffset.UTC).format(toFormat);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return value instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    private static String asString(Object value, String fallback) {
        return value instanceof String s ? s : fallback;
    }

    private static int asInt(Object value, int fallback) {
        return value instanceof Number n ? n.intValue() : fallback;
    }

    private static double asDouble(Object value, double fallback) {
        return value instanceof Number n ? n.doubleValue() : fallback;
    }

    private static double roundTo(double value, int decimals) {
        double factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }
}