package dev.dref;

public enum ModelAuthority {
    CLIENT("client"),
    INTERNAL("internal"),
    EXTERNAL("external");

    private final String value;

    ModelAuthority(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static ModelAuthority fromString(String val) {
        if (val == null) return INTERNAL;
        for (ModelAuthority auth : values()) {
            if (auth.value.equalsIgnoreCase(val) || auth.name().equalsIgnoreCase(val)) {
                return auth;
            }
        }
        throw new IllegalArgumentException("Unknown ModelAuthority: " + val);
    }
}
