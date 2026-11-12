package dev.dref;

import dev.regl.Range;

import java.util.ArrayList;
import java.util.List;

public record DomainModel(
    String name,
    ModelAuthority authority,
    String ttl,
    Range count,
    String scope,
    List<MappingDefinition> mapsFrom,
    List<Property> properties
) {
    public DomainModel {
        if (authority == null) authority = ModelAuthority.INTERNAL;
        if (mapsFrom == null) mapsFrom = List.of();
        if (properties == null) properties = List.of();
    }

    /**
     * Convenience constructor for a model without a scope reference and without
     * incoming mappings (the common case for programmatic usage).
     */
    public DomainModel(String name, ModelAuthority authority, String ttl,
                       Range count, List<Property> properties) {
        this(name, authority, ttl, count, null, List.of(), properties);
    }

    /**
     * Architectural classification is derived, not declared. A model that
     * declares a count range is a {@code configuration}; otherwise a model whose
     * every property is immutable is a {@code value}; anything else is an
     * {@code entity} and must declare at least one key property.
     */
    public ModelType classify() {
        if (hasCountRange()) return ModelType.CONFIGURATION;
        if (isImmutable()) return ModelType.VALUE;
        return ModelType.ENTITY;
    }

    /**
     * Whether the model constrains the number of instances (a count range is declared).
     */
    public boolean hasCountRange() {
        return count != null && count.isBounded();
    }

    /**
     * An instance is immutable when every property is immutable.
     */
    public boolean isImmutable() {
        return properties.stream().allMatch(Property::isImmutable);
    }

    public boolean isMutable() {
        return !isImmutable();
    }

    public static Builder builder(String name) {
        return new Builder(name);
    }

    public static class Builder {
        private final String name;
        private ModelAuthority authority = ModelAuthority.INTERNAL;
        private String ttl = null;
        private Range count = null;
        private String scope = null;
        private final List<MappingDefinition> mapsFrom = new ArrayList<>();
        private final List<Property> properties = new ArrayList<>();

        public Builder(String name) {
            this.name = name;
        }

        public Builder authority(ModelAuthority authority) { this.authority = authority; return this; }
        public Builder ttl(String ttl) { this.ttl = ttl; return this; }
        public Builder count(Range count) { this.count = count; return this; }
        public Builder scope(String scope) { this.scope = scope; return this; }
        public Builder map(MappingDefinition mapping) { this.mapsFrom.add(mapping); return this; }
        public Builder property(Property property) { this.properties.add(property); return this; }

        public DomainModel build() {
            return new DomainModel(name, authority, ttl, count, scope, mapsFrom, properties);
        }
    }
}