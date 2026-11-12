package dev.dref;

import java.util.ArrayList;
import java.util.List;

/**
 * A Mapping Definition describes how a foreign payload can be mapped onto its
 * containing model. It contains only the mapping information: which incoming
 * fields to read, which target properties to write, and an optional transform
 * chain per field. Validating the incoming object against its own model
 * document is the caller's responsibility — it is not part of the mapping.
 */
public record MappingDefinition(
    String name,
    String provider,
    String version,
    String description,
    List<FieldMapping> fields
) {
    public MappingDefinition {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Mapping definition requires a name.");
        }
        if (fields == null) fields = List.of();
    }

    public static Builder builder(String name) {
        return new Builder(name);
    }

    public static class Builder {
        private final String name;
        private String provider = null;
        private String version = null;
        private String description = null;
        private final List<FieldMapping> fields = new ArrayList<>();

        public Builder(String name) {
            this.name = name;
        }

        public Builder provider(String provider) { this.provider = provider; return this; }
        public Builder version(String version) { this.version = version; return this; }
        public Builder description(String description) { this.description = description; return this; }

        /** 1:1 identity mapping — the incoming field lands on a same-named target property. */
        public Builder field(String from) {
            fields.add(new FieldMapping(from));
            return this;
        }

        /** Multi-field mapping onto {@code to} with no transforms: the target receives the array of present source values. */
        public Builder multiField(String to, String... from) {
            fields.add(FieldMapping.multiFrom(from).to(to).build());
            return this;
        }

        /** 1:1 mapping to a differently named target property. */
        public Builder field(String from, String to) {
            fields.add(new FieldMapping(from, to, List.of()));
            return this;
        }

        public Builder field(String from, List<Transform> transforms) {
            fields.add(new FieldMapping(from, transforms));
            return this;
        }

        public Builder field(String from, String to, List<Transform> transforms) {
            fields.add(new FieldMapping(from, to, transforms));
            return this;
        }

        public Builder field(FieldMapping field) {
            fields.add(field);
            return this;
        }

        public MappingDefinition build() {
            return new MappingDefinition(name, provider, version, description, fields);
        }
    }
}