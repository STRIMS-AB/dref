package dev.dref;

import java.util.Map;

/**
 * Domain-wide conventions carried in a Domain Document's {@code defaults} block.
 * {@link Formats} and the resolved {@code defaults.fields} (domain field types)
 * are the managed properties; any other future global properties are carried raw
 * in {@link #properties()} so the DOMAIN document stays extensible without schema
 * changes.
 */
public record DomainDefaults(
    Formats formats,
    Map<String, Object> properties,
    Map<String, DomainFieldType> fields
) {
    public DomainDefaults {
        if (properties == null) properties = Map.of();
        if (fields == null) fields = Map.of();
    }

    public static final DomainDefaults EMPTY = new DomainDefaults(null, Map.of(), Map.of());

    public static DomainDefaults of(Formats formats) {
        return new DomainDefaults(formats, Map.of(), Map.of());
    }

    public Formats effectiveFormats() {
        return formats != null ? formats : Formats.ISO;
    }
}