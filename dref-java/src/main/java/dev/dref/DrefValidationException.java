package dev.dref;

import dev.regl.ValidationResult;
import dev.regl.ValidationError;

/**
 * Thrown by {@code DrefValidator.validateInstanceOrThrow(...)} when a validated
 * instance fails (i.e. the result carries at least one error). The offending
 * {@link ValidationResult} is available via {@link #result()}.
 */
public class DrefValidationException extends RuntimeException {

    private final ValidationResult result;

    public DrefValidationException(ValidationResult result) {
        super(summary(result));
        this.result = result;
    }

    public ValidationResult result() {
        return result;
    }

    private static String summary(ValidationResult result) {
        ValidationError first = result.errors().isEmpty() ? null : result.errors().get(0);
        StringBuilder sb = new StringBuilder("Validation failed with ")
                .append(result.errors().size())
                .append(" error(s)");
        if (result.hasWarnings()) {
            sb.append(" and ").append(result.warnings().size()).append(" warning(s)");
        }
        sb.append('.');
        if (first != null) {
            sb.append(" First error: ")
                    .append(first.field())
                    .append(':')
                    .append(first.rule())
                    .append(" — ")
                    .append(first.message());
        }
        return sb.toString();
    }
}