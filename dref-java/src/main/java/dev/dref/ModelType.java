package dev.dref;

public enum ModelType {
    ENTITY("entity"),
    VALUE("value"),
    CONFIGURATION("configuration");

    private final String value;

    ModelType(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static ModelType fromString(String val) {
        for (ModelType type : values()) {
            if (type.value.equalsIgnoreCase(val) || type.name().equalsIgnoreCase(val)) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown ModelType: " + val);
    }
}