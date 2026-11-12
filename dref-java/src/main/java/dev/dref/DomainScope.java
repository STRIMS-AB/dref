package dev.dref;

/**
 * A named scope within a domain (e.g. by bounded context or subdomain). Models
 * reference a scope by name via {@link DomainModel#scope()}; scopes do not
 * contain models directly.
 */
public record DomainScope(
    String name,
    String description
) {
    public DomainScope {
        if (name == null || !name.matches("^[a-z0-9_-]+$")) {
            throw new IllegalArgumentException(
                    "Scope name must be lowercase kebab-case (^[a-z0-9_-]+$), got '" + name + "'.");
        }
    }

    public DomainScope(String name) {
        this(name, null);
    }

    public static Builder builder(String name) {
        return new Builder(name);
    }

    public static class Builder {
        private final String name;
        private String description = null;

        public Builder(String name) {
            this.name = name;
        }

        public Builder description(String description) { this.description = description; return this; }

        public DomainScope build() {
            return new DomainScope(name, description);
        }
    }
}