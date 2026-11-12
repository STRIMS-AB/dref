package dev.dref;

import java.math.BigInteger;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * Lexical format conventions for the {@code Date}, {@code Time} and
 * {@code DateTime} field types — the {@code defaults.formats} of a DRef
 * domain document. Each slot is either a dref token pattern (YYYY MM DD HH
 * mm ss), the named form {@code iso8601} (that value kind's ISO-8601
 * representation), or the named epoch forms {@code epoch} (Unix seconds) and
 * {@code epochMillis} (Unix milliseconds), whose values are whole numbers
 * rather than strings.
 */
public record Formats(String date, String time, String dateTime) {

    /** Named ISO-8601 form: resolves to the ISO pattern of each value kind. */
    public static final String ISO_8601 = "iso8601";
    /** Named epoch form: values are whole numbers of Unix seconds. */
    public static final String EPOCH = "epoch";
    /** Named epoch form: values are whole numbers of Unix milliseconds. */
    public static final String EPOCH_MILLIS = "epochMillis";

    public static final Formats ISO = new Formats("YYYY-MM-DD", "HH:mm:ss", "YYYY-MM-DDTHH:mm:ssZ");


    /** The declared format for the type, or the ISO token pattern when absent. */
    public String forType(FieldType type) {
        return switch (type) {
            case DATE -> (date != null && !date.isBlank()) ? date : ISO.date;
            case TIME -> (time != null && !time.isBlank()) ? time : ISO.time;
            default -> (dateTime != null && !dateTime.isBlank()) ? dateTime : ISO.dateTime;
        };
    }

    /**
     * The format to emit for a mapped/produced value of the given field type:
     * a concrete dref token pattern (with {@link #ISO_8601} resolved to the
     * type's ISO pattern) or one of the epoch names. The mapper uses this to
     * know whether a temporal result is a formatted string or an epoch number.
     */
    public String outputSpec(FieldType type) {
        String raw = forType(type);
        if (raw.equalsIgnoreCase(ISO_8601)) {
            return defaultPattern(type);
        }
        return raw;
    }

    /**
     * The dref token pattern used to parse/format {@code String} temporal values
     * of the given field type, or {@code null} when the type's format is an epoch
     * form (no lexical string representation).
     */
    public String stringPattern(FieldType type) {
        String raw = forType(type);
        if (raw.equalsIgnoreCase(ISO_8601)) {
            return defaultPattern(type);
        }
        if (isEpochNamed(raw)) {
            return null;
        }
        return raw;
    }

    private static String defaultPattern(FieldType type) {
        return switch (type) {
            case DATE -> ISO.date;
            case TIME -> ISO.time;
            default -> ISO.dateTime;
        };
    }

    public static boolean isEpochNamed(String declared) {
        return declared != null
                && (EPOCH.equalsIgnoreCase(declared) || EPOCH_MILLIS.equalsIgnoreCase(declared));
    }

    public static boolean isEpochMillisNamed(String declared) {
        return declared != null && EPOCH_MILLIS.equalsIgnoreCase(declared);
    }

    public static String epochUnit(String declared) {
        return isEpochMillisNamed(declared) ? "milliseconds" : "seconds";
    }

    public static boolean isWholeNumber(Number value) {
        return dev.regl.TemporalFormats.isWholeNumber(value);
    }

    /**
     * Whether the given value is lexically parseable as the domain's format for the
     * given temporal field type. Used to validate Date/DateTime/Time string values
     * against the domain document's {@code defaults.formats}. Epoch formats have no
     * string form, so they never match here.
     */
    public boolean matches(FieldType type, String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        String pattern = stringPattern(type);
        if (pattern == null) {
            return false;
        }
        return dev.regl.TemporalFormats.matchesPattern(pattern, value);
    }

    /**
     * Parses the value as the domain's format for the given temporal field type.
     * Returns a {@link LocalDateTime}, {@link LocalDate} or {@link LocalTime}
     * depending on the field type. Only valid for non-epoch formats.
     */
    public Object parse(FieldType type, String value) {
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern(drefToJavaPattern(stringPattern(type)));
        return switch (type) {
            case DATE -> LocalDate.parse(value, formatter);
            case TIME -> LocalTime.parse(value, formatter);
            default -> formatter.parseBest(value, LocalDateTime::from, LocalDate::from);
        };
    }

    /**
     * Translates a dref token pattern (YYYY MM DD HH mm ss) into the equivalent
     * {@link DateTimeFormatter} pattern.
     */
    public static String drefToJavaPattern(String drefPattern) {
        return dev.regl.TemporalFormats.tokenToJavaPattern(drefPattern);
    }
}