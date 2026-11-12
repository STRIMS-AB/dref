package dev.dref.annotation;

import dev.dref.ModelAuthority;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Describes a DRef model at class level. When {@link #name()} is left blank the
 * class simple name is used. An omitted {@link #ttl()} means the model has no
 * explicit retention duration (lifecycle-manager-determined, persistent by default).
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
@Documented
public @interface Model {
    String name() default "";

    /**
     * Origin of the record: {@code client}, {@code internal} or {@code external}.
     * Defaults to {@link ModelAuthority#INTERNAL} when omitted; properties
     * without their own authority inherit this value.
     */
    ModelAuthority authority() default ModelAuthority.INTERNAL;

    String ttl() default "";

    /**
     * Optional reference to one of the domain's scopes by name.
     */
    String scope() default "";
}