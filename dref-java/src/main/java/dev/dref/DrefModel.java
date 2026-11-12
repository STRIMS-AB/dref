package dev.dref;

import dev.regl.Rule;
import dev.regl.RuleType;
import dev.regl.Range;
import dev.regl.ParameterType;

import dev.dref.annotation.Model;

import java.lang.annotation.Annotation;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Builds a {@link DomainModel} from an annotated class — the model is described
 * in the class itself via {@link Model}, {@link Property} and the rule
 * annotations in {@code dev.dref.rules}.
 */
public final class DrefModel {

    private DrefModel() {
    }


    public static DomainModel build(Class<?> type) {
        if (type == null) {
            throw new IllegalArgumentException("type must not be null.");
        }

        Model model = type.getAnnotation(Model.class);
        String name = (model != null && !model.name().isBlank()) ? model.name() : type.getSimpleName();
        ModelAuthority authority = model != null ? model.authority() : ModelAuthority.INTERNAL;
        String ttl = (model != null && !model.ttl().isBlank()) ? model.ttl() : null;
        String scope = (model != null && !model.scope().isBlank()) ? model.scope() : null;
        if (ttl != null && !ttl.matches("[1-9][0-9]*[smhdMy]")) {
            throw new IllegalArgumentException(
                    "Invalid ttl '" + ttl + "' on " + type.getName() + "; expected integer + unit (s, m, h, d, M, y).");
        }

        Map<String, Candidate> properties = new LinkedHashMap<>();
        collectFields(type, properties);
        collectGetters(type, properties);

        if (model == null && properties.isEmpty()) {
            throw new IllegalArgumentException(
                    type.getName() + " is not annotated as a model. Add @Model (dev.dref.annotation.Model) "
                            + "and @Property / rule annotations (dev.dref.rules) on its members.");
        }

        List<Property> result = new ArrayList<>();
        for (Candidate candidate : properties.values()) {
            result.add(candidate.toProperty());
        }
        return new DomainModel(name, authority, ttl, null, scope, List.of(), result);
    }

    private static void collectFields(Class<?> type, Map<String, Candidate> out) {
        for (Class<?> c = type; c != null && c != Object.class; c = c.getSuperclass()) {
            for (Field field : c.getDeclaredFields()) {
                if (Modifier.isStatic(field.getModifiers())) {
                    continue;
                }
                dev.dref.annotation.Property p = field.getAnnotation(dev.dref.annotation.Property.class);
                List<Annotation> annotations = ruleAnnotations(field.getAnnotations());
                if (p == null && annotations.isEmpty()) {
                    continue;
                }
                String key = field.getName();
                Candidate candidate = out.computeIfAbsent(key, k -> new Candidate());
                candidate.key = key;
                candidate.field = field;
                if (p != null) {
                    candidate.property(p, false);
                }
                for (Annotation a : annotations) {
                    candidate.addRule(toRule(a));
                }
            }
        }
    }

    private static void collectGetters(Class<?> type, Map<String, Candidate> out) {
        for (Method method : type.getMethods()) {
            if (Modifier.isStatic(method.getModifiers())
                    || method.getParameterCount() != 0
                    || method.getReturnType() == void.class) {
                continue;
            }
            String key = beanName(method.getName(), method.getReturnType());
            if (key == null) {
                continue;
            }
            dev.dref.annotation.Property p = method.getAnnotation(dev.dref.annotation.Property.class);
            List<Annotation> annotations = ruleAnnotations(method.getAnnotations());
            if (p == null && annotations.isEmpty()) {
                continue;
            }
            Candidate candidate = out.computeIfAbsent(key, k -> new Candidate());
            candidate.key = key;
            candidate.getter = method;
            if (p != null) {
                candidate.property(p, true);
            }
            for (Annotation a : annotations) {
                candidate.addRule(toRule(a));
            }
        }
    }

    private static String beanName(String methodName, Class<?> returnType) {
        if (methodName.startsWith("get")
                && methodName.length() > 3
                && Character.isUpperCase(methodName.charAt(3))) {
            return decapitalize(methodName.substring(3));
        }
        if (methodName.startsWith("is")
                && methodName.length() > 2
                && Character.isUpperCase(methodName.charAt(2))
                && (returnType == boolean.class || returnType == Boolean.class)) {
            return decapitalize(methodName.substring(2));
        }
        return null;
    }

    private static String decapitalize(String s) {
        return Character.toLowerCase(s.charAt(0)) + s.substring(1);
    }

    private static List<Annotation> ruleAnnotations(Annotation[] annotations) {
        List<Annotation> result = new ArrayList<>();
        for (Annotation a : annotations) {
            if (dev.regl.Rules.fromAnnotation(a) != null) {
                result.add(a);
            }
        }
        return result;
    }

    private static Rule toRule(Annotation a) {
        Rule c = toStrictRule(a);
        return c.withWarnOnly(warnOnlyOf(a));
    }

    private static boolean warnOnlyOf(Annotation a) {
        try {
            return Boolean.TRUE.equals(a.annotationType().getMethod("warnOnly").invoke(a));
        } catch (NoSuchMethodException e) {
            return false;
        } catch (ReflectiveOperationException e) {
            throw new IllegalArgumentException("Cannot read warnOnly() on rule annotation " + a, e);
        }
    }

    private static Rule toStrictRule(Annotation a) {
        Rule r = dev.regl.Rules.fromAnnotation(a);
        if (r != null) return r;
        throw new IllegalArgumentException("Unsupported rule annotation: " + a);
    }

    private static Class<?> elementClass(Class<?> type, Type generic) {
        if (type.isArray()) {
            return type.getComponentType();
        }
        if (generic instanceof ParameterizedType pt) {
            Type arg = pt.getActualTypeArguments()[0];
            return arg instanceof Class<?> c ? c : null;
        }
        return null;
    }

    private static boolean isCollection(Class<?> type) {
        return type.isArray() || Collection.class.isAssignableFrom(type);
    }

    private static FieldType inferType(Class<?> type, Type generic) {
        if (type == String.class || type == char.class || type == Character.class) {
            return FieldType.STRING;
        }
        if (type == boolean.class || type == Boolean.class) {
            return FieldType.BOOLEAN;
        }
        if (type.isPrimitive() || Number.class.isAssignableFrom(type)) {
            return FieldType.NUMBER;
        }
        if (type.isEnum()) {
            return FieldType.STRING;
        }
        if (type == LocalDate.class) {
            return FieldType.DATE;
        }
        if (type == LocalTime.class) {
            return FieldType.TIME;
        }
        if (type == LocalDateTime.class || type == Instant.class
                || type == ZonedDateTime.class || type == OffsetDateTime.class) {
            return FieldType.DATETIME;
        }
        if (isCollection(type)) {
            Class<?> element = elementClass(type, generic);
            return element != null ? inferType(element, element) : FieldType.STRING;
        }
        return FieldType.STRING;
    }

    private static final class Candidate {
        String key;
        Field field;
        Method getter;
        String nameOverride;
        String descriptionOverride;
        FieldType typeOverride = FieldType.INFERRED;
        Boolean requiredOverride;
        Boolean keyOverride;
        Boolean listOverride;
        ModelAuthority authorityOverride;
        final Map<String, Rule> rules = new LinkedHashMap<>();

        void property(dev.dref.annotation.Property p, boolean override) {
            if (!p.name().isBlank() && (override || nameOverride == null)) nameOverride = p.name();
            if (!p.description().isEmpty() && (override || descriptionOverride == null)) descriptionOverride = p.description();
            if (override || requiredOverride == null) requiredOverride = p.required();
            if (override || keyOverride == null) keyOverride = p.key();
            if (override || listOverride == null) listOverride = p.list();
            if (override || typeOverride == FieldType.INFERRED) typeOverride = p.type();
            if (!p.authority().isBlank() && (override || authorityOverride == null)) {
                authorityOverride = ModelAuthority.fromString(p.authority());
            }
        }

        void addRule(Rule c) {
            rules.putIfAbsent(c.code(), c);
        }

        Class<?> javaType() {
            return field != null ? field.getType() : getter.getReturnType();
        }

        Type genericType() {
            return field != null ? field.getGenericType() : getter.getGenericReturnType();
        }

        Property toProperty() {
            String propertyName = (nameOverride != null && !nameOverride.isBlank()) ? nameOverride : key;
            FieldType propertyType = (typeOverride != null && typeOverride != FieldType.INFERRED)
                    ? typeOverride
                    : inferType(javaType(), genericType());
            boolean isList = listOverride != null ? listOverride : isCollection(javaType());
            Property.Builder builder = Property.builder(propertyName, propertyType)
                    .required(requiredOverride != null && requiredOverride)
                    .key(keyOverride != null && keyOverride)
                    .list(isList)
                    .description(descriptionOverride);
            if (authorityOverride != null) {
                builder.authority(authorityOverride);
            }
            for (Rule c : rules.values()) {
                builder.addRule(c);
            }
            return builder.build();
        }
    }
}