package dev.dref;

import dev.regl.Rule;
import dev.regl.RuleType;
import dev.regl.ValidationResult;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class DrefValidatorTest {

    @Test
    void validateDateFieldsWithPattern() {
        DomainModel model = DomainModel.builder("Event")
                .property(Property.builder("eventDate", FieldType.DATE).required(true).build())
                .property(Property.builder("startsAt", FieldType.DATETIME).required(true).build())
                .build();

        Formats formats = new Formats("YYYY-MM-DD", null, "YYYY-MM-DDTHH:mm:ssZ");

        // Valid instances
        Map<String, Object> validData = Map.of(
                "eventDate", "2026-10-02",
                "startsAt", "2026-10-02T12:00:00Z"
        );
        ValidationResult validResult = DrefValidator.validateInstance(validData, model, formats);
        assertTrue(validResult.isValid(), "Expected valid dates: " + validResult.errors());

        // Invalid date format
        Map<String, Object> invalidData = Map.of(
                "eventDate", "02-10-2026",
                "startsAt", "2026-10-02T12:00:00Z"
        );
        ValidationResult invalidResult = DrefValidator.validateInstance(invalidData, model, formats);
        assertFalse(invalidResult.isValid(), "Expected invalid date format to fail");
    }

    @Test
    void validateEpochFields() {
        DomainModel model = DomainModel.builder("Telemetry")
                .property(Property.builder("timestamp", FieldType.DATETIME).required(true).build())
                .build();

        Formats formats = new Formats(null, null, "epoch");

        Map<String, Object> validEpoch = Map.of("timestamp", 1700000000L);
        ValidationResult validResult = DrefValidator.validateInstance(validEpoch, model, formats);
        assertTrue(validResult.isValid(), "Expected valid epoch: " + validResult.errors());

        Map<String, Object> invalidEpochType = Map.of("timestamp", "not-a-number");
        ValidationResult invalidResult = DrefValidator.validateInstance(invalidEpochType, model, formats);
        assertFalse(invalidResult.isValid(), "Expected string on epoch field to fail");
    }

    /**
     * The single-property path must accept an epoch exactly as the instance path
     * does. It used to derive the regl target type separately and kept NUMBER after
     * regl moved the epoch rules to DATETIME, so this call failed to even build a
     * schema -- a divergence the instance-path test could not see.
     */
    @Test
    void validatePropertyAcceptsEpochAsInstanceDoes() {
        Property timestamp = Property.builder("timestamp", FieldType.DATETIME)
                .required(true).build();
        Formats formats = new Formats(null, null, "epoch");

        assertTrue(DrefValidator.validateProperty(1700000000L, timestamp, formats).isValid(),
                "a whole-number epoch is an instant, so the property path must accept it");

        ValidationResult outOfRange = DrefValidator.validateProperty(1.5, timestamp, formats);
        assertFalse(outOfRange.isValid(), "1.5 is neither a whole number nor an instant");

        assertFalse(DrefValidator.validateProperty("2026-10-02T12:00:00Z", timestamp, formats)
                        .isValid(),
                "an ISO string is not a declared epoch value");
    }

    @Test
    void validateIntegerIsAWholeNumberAndStillTakesNumberRules() {
        Property stock = Property.builder("stock", FieldType.INTEGER).required(true).build();

        assertTrue(DrefValidator.validateInstance(Map.of("stock", 0), modelWith(stock)).isValid());
        assertTrue(DrefValidator.validateInstance(Map.of("stock", 1.0), modelWith(stock)).isValid(),
                "1.0 is the same number as 1");
        assertTrue(DrefValidator.validateInstance(Map.of("stock", 2147483648L), modelWith(stock))
                        .isValid(),
                "above Integer.MAX_VALUE, so it arrives as a Long: the value is whole even when "
                        + "the Java class is not a boxed Integer");

        ValidationResult fractional = DrefValidator.validateInstance(Map.of("stock", 5.5), modelWith(stock));
        assertFalse(fractional.isValid(), "5.5 has a fractional part");
        assertFalse(DrefValidator.validateInstance(Map.of("stock", "5"), modelWith(stock)).isValid(),
                "a numeric string is a String, not an Integer");

        // The widening: a NUMBER magnitude rule still speaks about an Integer field.
        Property port = Property.builder("port", FieldType.INTEGER).required(true)
                .rules(List.of(new Rule(RuleType.LESS_THAN, 65536))).build();
        DomainModel model = DomainModel.builder("Telemetry").property(port).build();
        assertTrue(DrefValidator.validateInstance(Map.of("port", 8080), model).isValid());
        assertFalse(DrefValidator.validateInstance(Map.of("port", 70000), model).isValid());
    }

    @Test
    void ruleSeverityWarnDemotesToWarning() {
        Property email = Property.builder("email", FieldType.STRING).required(true)
                .rules(List.of(new Rule(RuleType.EMAIL, null))).build();
        DomainModel model = DomainModel.builder("Contact").property(email).build();

        // No severity: blocking.
        assertFalse(DrefValidator.validateInstance(Map.of("email", "nope"), model).isValid());

        // severity: warn -- the same rule, demoted, which is what DrefRule.severity means.
        Property warned = Property.builder("email", FieldType.STRING).required(true)
                .rules(List.of(new Rule(RuleType.EMAIL, null, true))).build();
        ValidationResult result = DrefValidator.validateInstance(Map.of("email", "nope"),
                DomainModel.builder("Contact").property(warned).build());
        assertTrue(result.isValid(), "a warn-severity failure never blocks");
        assertEquals(1, result.warnings().size());
        assertEquals(0, result.errors().size());
    }

    @Test
    void ruleSeverityMustBeErrorOrWarn() {
        assertThrows(IllegalArgumentException.class, () -> DrefDomain.from(Map.of(
                "name", "D",
                "models", List.of(Map.of(
                        "name", "M",
                        "properties", List.of(Map.of(
                                "name", "p",
                                "type", "String",
                                "rules", List.of(Map.of("type", "email", "severity", "soft")))))))));
    }

    private static DomainModel modelWith(Property property) {
        return DomainModel.builder("M").property(property).build();
    }

    @Test
    void validateDomainWithCustomFields() {
        Map<String, Object> domainMap = Map.of(
                "name", "IdentityDomain",
                "defaults", Map.of(
                        "fields", Map.of(
                                "EmailStr", Map.of(
                                        "type", "string",
                                        "rules", List.of(
                                                Map.of("type", "email")
                                        )
                                )
                        )
                ),
                "models", List.of(
                        Map.of(
                                "name", "User",
                                "properties", List.of(
                                        Map.of(
                                                "name", "email",
                                                "type", "EmailStr",
                                                "required", true
                                        )
                                )
                        )
                )
        );

        DrefDomain domain = DrefDomain.from(domainMap);
        DomainModel userModel = domain.model("User");
        assertNotNull(userModel);

        Map<String, Object> validUser = Map.of("email", "alice@example.com");
        ValidationResult validResult = DrefValidator.validateInstance(validUser, userModel);
        assertTrue(validResult.isValid(), "Expected valid email: " + validResult.errors());

        Map<String, Object> invalidUser = Map.of("email", "not-an-email");
        ValidationResult invalidResult = DrefValidator.validateInstance(invalidUser, userModel);
        assertFalse(invalidResult.isValid(), "Expected invalid email to fail");
    }

    @Test
    void validateDateRulesInProperties() {
        Property property = Property.builder("expiryDate", FieldType.STRING)
                .addRule(new Rule(RuleType.ISO_DATE))
                .build();

        ValidationResult validRes = DrefValidator.validateProperty("2026-12-31", property);
        assertTrue(validRes.isValid(), "Expected ISO date to pass: " + validRes.errors());

        ValidationResult invalidRes = DrefValidator.validateProperty("2026/12/31", property);
        assertFalse(invalidRes.isValid(), "Expected non-ISO date to fail");
    }
}
