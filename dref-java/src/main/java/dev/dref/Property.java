package dev.dref;

import dev.regl.Rule;
import dev.regl.RuleType;
import dev.regl.Range;

import java.util.ArrayList;
import java.util.List;

public record Property(
    String name,
    FieldType type,
    boolean required,
    boolean key,
    boolean list,
    boolean immutable,
    String description,
    List<Rule> rules,
    ModelAuthority authority
) {
    public Property {
        if (rules == null) rules = List.of();
    }

    public Property(String name, FieldType type, boolean required, boolean key, boolean list, boolean immutable, String description, List<Rule> rules) {
        this(name, type, required, key, list, immutable, description, rules, null);
    }

    public static Builder builder(String name, FieldType type) {
        return new Builder(name, type);
    }

    public boolean isImmutable() {
        return immutable;
    }

    public static class Builder implements dev.regl.AllRules<Builder> {
        private final String name;
        private final FieldType type;
        private boolean required = false;
        private boolean key = false;
        private boolean list = false;
        private boolean immutable = false;
        private String description = null;
        private ModelAuthority authority = null;
        private List<Rule> rules = List.of();

        public Builder(String name, FieldType type) {
            this.name = name;
            this.type = type;
        }

        public Builder required(boolean required) { this.required = required; return this; }
        public Builder immutable(boolean immutable) { this.immutable = immutable; return this; }
        public Builder immutable() { this.immutable = true; return this; }
        public Builder key(boolean key) { this.key = key; return this; }
        public Builder list(boolean list) { this.list = list; return this; }
        public Builder description(String desc) { this.description = desc; return this; }
        public Builder authority(ModelAuthority authority) { this.authority = authority; return this; }
        public Builder rules(List<Rule> rules) { this.rules = rules != null ? List.copyOf(rules) : List.of(); return this; }

        @Override
        public Builder addRule(Rule rule) { 
            List<Rule> list = new ArrayList<>(rules);
            list.add(rule);
            this.rules = List.copyOf(list);
            return this;
        }

        public Property build() {
            return new Property(name, type, required, key, list, immutable, description, rules, authority);
        }
    }
}
