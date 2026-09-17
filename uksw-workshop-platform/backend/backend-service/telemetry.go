package main

import (
	"context"
	"log"
	"os"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.17.0"
)

// InitTracer initializes the OpenTelemetry tracer provider for distributed tracing.
// It configures the OTLP HTTP exporter to send traces to Jaeger or any OTLP-compatible backend.
// Returns a shutdown function that should be called during application shutdown.
func InitTracer() func(context.Context) error {
	ctx := context.Background()

	// Get OTLP endpoint from environment variable
	// Supports formats: "http://jaeger:4318", "jaeger:4318", or "localhost:4318"
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		endpoint = "http://localhost:4318" // Default OTLP HTTP endpoint
		log.Printf("[Telemetry] No OTEL_EXPORTER_OTLP_ENDPOINT set, using default: %s", endpoint)
	}

	// Ensure endpoint has http:// prefix for otlptracehttp
	if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
		endpoint = "http://" + endpoint
	}

	log.Printf("[Telemetry] Initializing OpenTelemetry with endpoint: %s", endpoint)

	// Get deployment environment from env or default to production
	deployEnv := os.Getenv("DEPLOYMENT_ENV")
	if deployEnv == "" {
		deployEnv = "production"
	}

	// Get service name from env or default
	serviceName := os.Getenv("OTEL_SERVICE_NAME")
	if serviceName == "" {
		serviceName = "backend-service"
	}

	// Create OTLP HTTP exporter
	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpointURL(endpoint),
		otlptracehttp.WithInsecure(), // Use insecure for internal Docker network communication
	)
	if err != nil {
		log.Printf("[Telemetry] ERROR: Failed to create OTLP exporter: %v", err)
		log.Printf("[Telemetry] Traces will NOT be exported. Check OTEL_EXPORTER_OTLP_ENDPOINT configuration.")
		// Return no-op shutdown function instead of crashing
		return func(ctx context.Context) error { return nil }
	}

	// Create resource with service metadata for trace identification
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(serviceName),
			semconv.ServiceVersion("1.0.0"),
			semconv.DeploymentEnvironment(deployEnv),
		),
	)
	if err != nil {
		log.Printf("[Telemetry] WARNING: Failed to create resource, using default: %v", err)
		res = resource.Default()
	}

	// Create TracerProvider with batched exporting for efficiency
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter, sdktrace.WithBatchTimeout(5*time.Second)),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.AlwaysSample()), // Sample all traces for dev/demo
	)

	// Set global TracerProvider for use throughout the application
	otel.SetTracerProvider(tp)

	// Set global Propagator (W3C Trace Context for cross-service trace correlation)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	log.Printf("[Telemetry] OpenTelemetry initialized successfully (service: %s, env: %s)", serviceName, deployEnv)

	return tp.Shutdown
}
