package dev.dref;

import dev.regl.Rule;

import java.util.List;

/**
 * A domain field type declared under {@code defaults.fields} — a named,
 * reusable field definition referenced from a property's {@code type}. It is
 * fully resolved: {@link #type()} is always a base builtin field type (never
 * another domain field type), with the declaration's {@code list} flag and
 * rules carried over. When a property references a domain field type,
 * its value is the property's builtin {@code type} plus the union of the
 * field type's and the property's own rules.
 */
public record DomainFieldType(
    FieldType type,
    boolean list,
    List<Rule> rules
) {
    public DomainFieldType {
        if (rules == null) rules = List.of();
    }
}