import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextCoreWebVitals,
  {
    ignores: [".next/**", ".next-dev/**", "playwright-report/**", "test-results/**"],
  },
];

export default config;
