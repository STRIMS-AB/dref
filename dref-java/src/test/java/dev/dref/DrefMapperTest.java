package dev.dref;

import dev.regl.ValidationResult;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class DrefMapperTest {

    private static final String STRIPE_PAYMENT_ID = "pi_3NabcDEFxyz";

    private MappingDefinition stripePaymentIntentMapping() {
        return MappingDefinition.builder("Stripe PaymentIntent")
                .provider("Stripe")
                .version("1.0.0")
                .description("Map a Stripe PaymentIntent object onto the DRef external PaymentIntent.")
                .field("id")
                .field("status")
                .field("order_id", "orderId")
                .field("payment_method", "paymentMethodId")
                .field("amount", List.of(new Transform(TransformType.DIVIDE, 100)))
                .field("currency", List.of(new Transform(TransformType.UPPER_CASE)))
                .field("description", List.of(new Transform(TransformType.TRIM)))
                .field("created", "createdAt", List.of(new Transform(TransformType.FORMAT_DATE, "unix")))
                .build();
    }

    @Test
    void mapsConciseOneToOneAndTransformChains() {
        Map<String, Object> source = newLinkedHashMap(
                "id", STRIPE_PAYMENT_ID,
                "amount", 1099,
                "currency", "usd",
                "description", "  Chromecast  ",
                "status", "succeeded",
                "order_id", "ord_12",
                "payment_method", "pm_987",
                "created", 1699899982L);

        MappingResult result = DrefMapper.map(source, stripePaymentIntentMapping());

        assertTrue(result.isValid(), "Mapping should succeed: " + result.errors());
        assertNotNull(result.target());
        assertEquals(STRIPE_PAYMENT_ID, result.target().get("id"));
        assertEquals(10.99, (Double) result.target().get("amount"), 0.0001);
        assertEquals("USD", result.target().get("currency"));
        assertEquals("Chromecast", result.target().get("description"));
        assertEquals("succeeded", result.target().get("status"));
        assertEquals("ord_12", result.target().get("orderId"));
        assertEquals("pm_987", result.target().get("paymentMethodId"));
        assertEquals("2023-11-13T18:26:22Z", result.target().get("createdAt"));
    }

    @Test
    void formatDateEmitsTargetModelOrDomainFormat() {
        MappingDefinition mapping = MappingDefinition.builder("Epoch Row")
                .field("created", "createdAt", List.of(new Transform(TransformType.FORMAT_DATE, "unix")))
                .build();

        // No context -> standard ISO dateTime
        assertEquals("2023-11-13T18:26:22Z",
                DrefMapper.map(Map.of("created", 1699899982L), mapping).target().get("createdAt"));

        // Domain formats by field type
        Formats formats = new Formats("DD/MM/YYYY", "HH:mm", "DD-MM-YYYY HH:mm:ss");
        DomainModel target = new DomainModel("Row", ModelAuthority.EXTERNAL, null, null,
                List.of(Property.builder("createdAt", FieldType.DATETIME).build()));
        assertEquals("13-11-2023 18:26:22",
                DrefMapper.map(Map.of("created", 1699899982L), mapping, null, target, formats).target().get("createdAt"));

        // Date-typed property selects the domain date format
        DomainModel dateOnly = new DomainModel("Row", ModelAuthority.EXTERNAL, null, null,
                List.of(Property.builder("createdAt", FieldType.DATE).build()));
        assertEquals("13/11/2023",
                DrefMapper.map(Map.of("created", 1699899982L), mapping, null, dateOnly, formats).target().get("createdAt"));
    }

    @Test
    void formatDateParsesSourcePatternsAndMillisEpochs() {
        MappingDefinition mapping = MappingDefinition.builder("Legacy Row")
                .field("created_at", "createdAt", List.of(new Transform(TransformType.FORMAT_DATE, "unix")))
                .field("when", "when", List.of(new Transform(TransformType.FORMAT_DATE, "YYYY/MM/DD")))
                .field("stamp_ms", "stamp", List.of(new Transform(TransformType.FORMAT_DATE, "unix")))
                .build();

        MappingResult result = DrefMapper.map(newLinkedHashMap(
                "created_at", "1699899982",
                "when", "2023/11/13",
                "stamp_ms", 1699899982000L), mapping);

        assertEquals("2023-11-13T18:26:22Z", result.target().get("createdAt"));
        assertEquals("2023-11-13T00:00:00Z", result.target().get("when"));
        assertEquals("2023-11-13T18:26:22Z", result.target().get("stamp"));
    }

    @Test
    void formatDateEmitsNamedEpochAndIso8601Outputs() {
        MappingDefinition mapping = MappingDefinition.builder("Epoch Row")
                .field("created", "createdAt", List.of(new Transform(TransformType.FORMAT_DATE, "unix")))
                .build();
        DomainModel target = new DomainModel("Row", ModelAuthority.EXTERNAL, null, null,
                List.of(Property.builder("createdAt", FieldType.DATETIME).build()));

        // dateTime 'epoch' -> whole-number seconds
        assertEquals(Long.valueOf(1699899982L),
                (Long) DrefMapper.map(Map.of("created", 1699899982L), mapping, null, target,
                        new Formats("iso8601", "iso8601", "epoch")).target().get("createdAt"));

        // dateTime 'epochMillis' -> whole-number milliseconds
        assertEquals(Long.valueOf(1699899982000L),
                (Long) DrefMapper.map(Map.of("created", 1699899982L), mapping, null, target,
                        new Formats("iso8601", "iso8601", "epochMillis")).target().get("createdAt"));

        // dateTime 'iso8601' -> that value kind's ISO pattern string
        assertEquals("2023-11-13T18:26:22Z",
                DrefMapper.map(Map.of("created", 1699899982L), mapping, null, target,
                        new Formats("iso8601", "iso8601", "iso8601")).target().get("createdAt"));

        // date-only target resolves the date slot of iso8601
        DomainModel dateOnly = new DomainModel("Row", ModelAuthority.EXTERNAL, null, null,
                List.of(Property.builder("createdAt", FieldType.DATE).build()));
        assertEquals("2023-11-13",
                DrefMapper.map(Map.of("created", 1699899982L), mapping, null, dateOnly,
                        new Formats("iso8601", "iso8601", "iso8601")).target().get("createdAt"));
    }

    @Test
    void identityMappingKeepsSourceNameWhenToUnspecified() {
        FieldMapping identity = FieldMapping.builder("email").build();
        assertEquals("email", identity.targetProperty());
        assertEquals("contactEmail", FieldMapping.builder("email").to("contactEmail").build().targetProperty());
    }

    @Test
    void mapsForeignPayloadWithoutValidatingIt() {
        Map<String, Object> badPayload = newLinkedHashMap(
                "id", "cus_123",   // wrong prefix — would fail a source-model validation
                "amount", -5,       // negative amount — would fail a source-model validation
                "currency", "USD",
                "status", "succeeded",
                "order_id", "ord_1",
                "created", 1699899982L);

        MappingResult result = DrefMapper.map(badPayload, stripePaymentIntentMapping());

        assertTrue(result.isValid(), "The mapper must not validate the incoming object: " + result.errors());
        assertEquals("cus_123", result.target().get("id"));
        assertEquals(-0.05, (Double) result.target().get("amount"), 0.0001);
    }

    @Test
    void nullForeignPayloadIsRejected() {
        MappingResult result = DrefMapper.map(null, stripePaymentIntentMapping());
        assertFalse(result.isValid());
        assertNull(result.target());
    }

    @Test
    void appliesCustomLambdasThroughResolver() {
        MappingDefinition mapping = MappingDefinition.builder("Acme Event")
                .field("product_code", "productCode", List.of(new Transform(TransformType.CUSTOM, "com.acme.slug")))
                .build();

        Map<String, Object> source = Map.of("product_code", "  Widget Pro  ");
        MappingResult result = DrefMapper.map(source, mapping, reference -> {
            assertEquals("com.acme.slug", reference);
            return s -> String.valueOf(s).toUpperCase();
        });

        assertTrue(result.isValid(), "Mapping should succeed: " + result.errors());
        assertEquals("  WIDGET PRO  ", result.target().get("productCode"));
    }

    @Test
    void customWithoutResolverIsRejected() {
        MappingDefinition mapping = MappingDefinition.builder("Acme Event")
                .field("code", List.of(new Transform(TransformType.CUSTOM, "com.acme.magic")))
                .build();

        assertThrows(IllegalArgumentException.class,
                () -> DrefMapper.map(Map.of("code", "x"), mapping));
    }

    @Test
    void defaultAndConstantFillMissingForeignValues() {
        MappingDefinition mapping = MappingDefinition.builder("Legacy Row")
                .field("email", List.of(new Transform(TransformType.DEFAULT, "unknown@example.com")))
                .field("source", List.of(new Transform(TransformType.CONSTANT, "legacy-import")))
                .build();

        MappingResult result = DrefMapper.map(Map.of(), mapping);

        assertTrue(result.isValid(), "Mapping should succeed: " + result.errors());
        assertEquals("unknown@example.com", result.target().get("email"));
        assertEquals("legacy-import", result.target().get("source"));
    }

    @Test
    void multiFieldFromJoinsSourceValues() {
        MappingDefinition mapping = MappingDefinition.builder("Contact Row")
                .field(FieldMapping.multiFrom("first_name", "last_name")
                        .to("fullName")
                        .add(TransformType.JOIN, " ")
                        .build())
                .build();

        MappingResult result = DrefMapper.map(newLinkedHashMap(
                "first_name", "Ada",
                "last_name", "Lovelace"), mapping);

        assertTrue(result.isValid(), "Mapping should succeed: " + result.errors());
        assertEquals("Ada Lovelace", result.target().get("fullName"));
    }

    @Test
    void multiFieldFromSkipsAbsentSourcesAndDefaultsToNull() {
        MappingDefinition mapping = MappingDefinition.builder("Contact Row")
                .field(FieldMapping.multiFrom("first_name", "nickname")
                        .to("displayName")
                        .add(TransformType.JOIN, " ")
                        .build())
                .build();

        // A missing source is skipped by the join
        assertEquals("Ada", DrefMapper.map(Map.of("first_name", "Ada"), mapping).target().get("displayName"));

        // When no source is present the value is null and the chain passes it through
        MappingResult none = DrefMapper.map(Map.of(), mapping);
        assertTrue(none.isValid());
        assertNull(none.target().get("displayName"));
    }

    @Test
    void multiFieldWithoutTransformCopiesPresentValuesAsList() {
        MappingDefinition mapping = MappingDefinition.builder("Profile Row")
                .multiField("tags", "hobbies", "interests")
                .build();

        MappingResult result = DrefMapper.map(newLinkedHashMap(
                "hobbies", "chess",
                "interests", "math"), mapping);

        assertTrue(result.isValid(), "Mapping should succeed: " + result.errors());
        assertEquals(List.of("chess", "math"), result.target().get("tags"));
    }

    @Test
    void multiFieldRequiresTargetAndNonBlankSources() {
        assertThrows(IllegalArgumentException.class,
                () -> FieldMapping.multiFrom("a", "b").build(),
                "A multi-field mapping requires a 'to' target property");
        assertThrows(IllegalArgumentException.class,
                () -> FieldMapping.multiFrom("a", " ").to("x").build(),
                "'fromFields' entries must be non-blank");
    }

    @Test
    void duplicateSourceFieldsAcrossMappingsAreDetected() {
        MappingDefinition mapping = MappingDefinition.builder("Dup")
                .field("a", "x", List.of())
                .field(FieldMapping.multiFrom("a", "b").to("y").build())
                .build();

        ValidationResult result = DrefValidator.validateMappingDefinition(mapping);
        assertFalse(result.isValid());
        assertTrue(result.errors().stream().anyMatch(e -> "duplicateFrom".equals(e.rule())));
    }

    private static Map<String, Object> newLinkedHashMap(Object... kv) {
        Map<String, Object> map = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            map.put((String) kv[i], kv[i + 1]);
        }
        return map;
    }
}