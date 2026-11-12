package dev.dref;

public enum FieldType {
    STRING("String"),
    NUMBER("Number"),
    INTEGER("Integer"),
    BOOLEAN("Boolean"),
    DATE("Date"),
    DATETIME("DateTime"),
    TIME("Time"),
    INFERRED("");

    private final String label;

    FieldType(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    public static FieldType fromLabel(String label) {
        if (label == null) {
            throw new IllegalArgumentException("Field type cannot be null.");
        }
        for (FieldType type : values()) {
            if (type.label.equalsIgnoreCase(label)) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown field type: " + label);
    }

    /**
     * Returns the builtin field type for the label, or {@code null} when the
     * label is not a builtin (it may be a domain field type). Never matches
     * {@link #INFERRED}, which has no document label.
     */
    public static FieldType fromLabelOrNull(String label) {
        if (label == null) return null;
        for (FieldType type : values()) {
            if (type != INFERRED && type.label.equalsIgnoreCase(label)) {
                return type;
            }
        }
        return null;
    }

    @Override
    public String toString() {
        return label;
    }
}
