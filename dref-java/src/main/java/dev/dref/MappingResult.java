package dev.dref;

import dev.regl.ValidationError;

import java.util.List;
import java.util.Map;

/**
 * Result of a mapping run: whether the foreign payload passed the source model
 * rules and, when it did, the resulting target instance map.
 */
public record MappingResult(
    boolean isValid,
    List<ValidationError> errors,
    Map<String, Object> target
) {
    public static MappingResult valid(Map<String, Object> target) {
        return new MappingResult(true, List.of(), target);
    }

    public static MappingResult invalid(List<ValidationError> errors) {
        return new MappingResult(false, errors, null);
    }
}