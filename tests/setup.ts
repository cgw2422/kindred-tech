process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://kindred:kindred@localhost:5432/kindred_test";
process.env.APP_URL = "http://localhost:3000";
process.env.EMAIL_DELIVERY_MODE = "disabled";
delete process.env.RESEND_API_KEY;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.MAPBOX_ACCESS_TOKEN;
