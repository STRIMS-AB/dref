package dev.dref;

import java.util.ArrayList;
import java.util.List;

/**
 * One field of a Mapping Document. {@code from} is a single property of the
 * incoming payload; alternatively {@code fromFields} names several source
 * properties, whose present values are assembled into an array the transform
 * chain starts from (e.g. a {@code join} step). {@code to} is the property the
 * result lands on (defaults to {@code from} for a 1:1 copy, and is required
 * for a multi-field mapping); {@code transforms} reshapes the value before it
 * is written.
 */
public record FieldMapping(
    String from,
    List<String> fromFields,
    String to,
    List<Transform> transforms
) {
    public FieldMapping {
        boolean single = from != null && !from.isBlank();
        boolean multi = fromFields != null && !fromFields.isEmpty();
        if (single == multi) {
            throw new IllegalArgumentException(
                    "FieldMapping requires either a single 'from' source property or a non-empty 'fromFields' list.");
        }
        if (multi) {
            for (String f : fromFields) {
                if (f == null || f.isBlank()) {
                    throw new IllegalArgumentException("FieldMapping 'fromFields' entries must be non-blank source property names.");
                }
            }
            if (to == null || to.isBlank()) {
                throw new IllegalArgumentException("A multi-field FieldMapping requires a 'to' target property.");
            }
        }
        if (fromFields == null) fromFields = List.of();
        if (transforms == null) transforms = List.of();
    }

    public FieldMapping(String from) {
        this(from, null, null, List.of());
    }

    public FieldMapping(String from, List<Transform> transforms) {
        this(from, null, null, transforms);
    }

    public FieldMapping(String from, String to, List<Transform> transforms) {
        this(from, null, to, transforms);
    }

    /** Whether this mapping reads several source fields (array-from). */
    public boolean isMultiSource() {
        return fromFields != null && !fromFields.isEmpty();
    }

    /** The source property names read from the incoming payload, in declared order. */
    public List<String> sourceProperties() {
        return isMultiSource() ? fromFields : List.of(from);
    }

    public String targetProperty() {
        return (to == null || to.isBlank()) ? from : to;
    }

    public static Builder builder(String from) {
        return new Builder(from, null);
    }

    /** A multi-field mapping: reads each named source property; the transform chain starts from the array of present values. */
    public static Builder multiFrom(String... fields) {
        return new Builder(null, List.of(fields));
    }

    public static class Builder {
        private final String from;
        private final List<String> fromFields;
        private String to = null;
        private final List<Transform> transforms = new ArrayList<>();

        private Builder(String from, List<String> fromFields) {
            this.from = from;
            this.fromFields = fromFields;
        }

        public Builder to(String to) {
            this.to = to;
            return this;
        }

        public Builder add(TransformType type) {
            return add(new Transform(type));
        }

        public Builder add(TransformType type, Object param) {
            return add(new Transform(type, param));
        }

        public Builder add(Transform transform) {
            transforms.add(transform);
            return this;
        }

        public FieldMapping build() {
            return new FieldMapping(from, fromFields, to, transforms);
        }
    }
}
