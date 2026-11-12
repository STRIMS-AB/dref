package dev.dref;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Parsing a domain document: model references (specification §3.1). */
public class DrefDomainTest {

    private static Map<String, Object> property(String name, String type, boolean key) {
        return Map.of("name", name, "type", type, "key", key);
    }

    private static Map<String, Object> domain(List<Map<String, Object>> models) {
        return Map.of("name", "shop", "models", models);
    }

    @Test
    void aModelReferenceIsTheReferencedKeysType() {
        // Product refers forward to Category, Order refers back to Product and to itself
        DrefDomain d = DrefDomain.from(domain(List.of(
                Map.of("name", "Product", "properties", List.of(
                        property("id", "String", true),
                        Map.of("name", "categoryId", "type", "#Category", "required", true))),
                Map.of("name", "Category", "properties", List.of(property("id", "Integer", true))),
                Map.of("name", "Order", "properties", List.of(
                        property("id", "String", true),
                        Map.of("name", "lines", "type", "#Product", "list", true),
                        property("parent", "#Order", false))))));

        DomainModel product = d.model("Product");
        Property categoryId = product.properties().stream().filter(p -> p.name().equals("categoryId")).findFirst().orElseThrow();
        assertEquals(FieldType.INTEGER, categoryId.type());
        assertTrue(categoryId.required());
        Property lines = d.model("Order").properties().stream().filter(p -> p.name().equals("lines")).findFirst().orElseThrow();
        assertEquals(FieldType.STRING, lines.type());
        assertTrue(lines.list(), "a to-many link is a list of keys");

        assertTrue(DrefValidator.validateInstance(Map.of("id", "p1", "categoryId", 7), product).isValid());
        assertFalse(DrefValidator.validateInstance(Map.of("id", "p1", "categoryId", "seven"), product).isValid(),
                "the value is checked as the referenced key's type");
        assertFalse(DrefValidator.validateInstance(Map.of("id", "p1"), product).isValid(), "a required reference is required");
    }

    @Test
    void aReferenceToAnUndeclaredModelIsAnError() {
        IllegalArgumentException unknown = assertThrows(IllegalArgumentException.class, () -> DrefDomain.from(domain(List.of(
                Map.of("name", "Product", "properties", List.of(property("categoryId", "#Category", false)))))));
        assertEquals("Property 'Product.categoryId' references unknown model '#Category' (declare the model in this domain).",
                unknown.getMessage());

        IllegalArgumentException invalid = assertThrows(IllegalArgumentException.class, () -> DrefDomain.from(domain(List.of(
                Map.of("name", "Product", "properties", List.of(property("categoryId", "#category", false)))))));
        assertTrue(invalid.getMessage().contains("invalid model reference '#category'"), invalid.getMessage());
    }

    @Test
    void aReferenceToAModelWithoutAKeyUsesItsFirstProperty() {
        DrefDomain d = DrefDomain.from(domain(List.of(
                Map.of("name", "Tag", "properties", List.of(property("code", "Integer", false))),
                Map.of("name", "Post", "properties", List.of(property("tag", "#Tag", false))))));
        assertEquals(FieldType.INTEGER, d.model("Post").properties().get(0).type());
    }

    /**
     * {@code immutable} is DRef's marker, not a rule a value passes or fails: a document
     * that declares it (on a property or on its field type) still validates its instances.
     */
    @Test
    void theImmutableRuleMarksThePropertyAndIsNotEvaluated() {
        DrefDomain d = DrefDomain.from(Map.of(
                "name", "shop",
                "defaults", Map.of("fields", Map.of(
                        "Timestamp", Map.of("type", "DateTime", "rules", List.of(Map.of("type", "immutable"))))),
                "models", List.of(
                        Map.of("name", "Customer", "properties", List.of(
                                Map.of("name", "id", "type", "String", "key", true, "required", true, "rules", List.of(
                                        Map.of("type", "startsWith", "param", "cus_"), Map.of("type", "immutable"))),
                                Map.of("name", "createdAt", "type", "Timestamp"),
                                Map.of("name", "locked", "type", "String", "immutable", true),
                                Map.of("name", "email", "type", "String"))))));

        DomainModel customer = d.model("Customer");
        Property id = customer.properties().get(0);
        assertTrue(id.isImmutable());
        assertEquals(List.of("startsWith"), id.rules().stream().map(dev.regl.Rule::code).toList(),
                "the marker is not one of the value's rules");
        assertTrue(customer.properties().get(1).isImmutable(), "declared by the field type");
        assertTrue(customer.properties().get(1).rules().isEmpty());
        assertTrue(customer.properties().get(2).isImmutable(), "declared as an attribute");
        assertFalse(customer.properties().get(3).isImmutable());
        assertEquals(ModelType.ENTITY, customer.classify());

        assertTrue(DrefValidator.validateInstance(Map.of("id", "cus_1", "email", "a@b.co"), customer).isValid());
        assertFalse(DrefValidator.validateInstance(Map.of("id", "1"), customer).isValid(),
                "the property's other rules still apply");
        assertTrue(DrefValidator.validateProperty("cus_1", id).isValid());
    }
}
