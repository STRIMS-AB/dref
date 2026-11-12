package dev.dref.annotation;

import dev.dref.FieldType;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Describes a model property. Place on a field or its getter. When
 * {@link #name()} is left blank the Java member name is used (a {@code getX()}
 * getter contributes {@code x}). {@link #type()} defaults to
 * {@link FieldType#INFERRED}, meaning the type is derived from the Java type.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.FIELD, ElementType.METHOD})
@Documented
public @interface Property {
    String name() default "";

    String description() default "";

    boolean required() default false;

    boolean key() default false;

    boolean list() default false;

    FieldType type() default FieldType.INFERRED;

    /**
     * Principal permitted to set this property's value: {@code client},
     * {@code internal} or {@code external}. Blank (the default) means any
     * principal may write the property. Enforced by
     * {@code DrefValidator.validateWrite} against the writer's authority.
     */
    String authority() default "";
}