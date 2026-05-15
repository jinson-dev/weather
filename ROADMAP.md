# 🗺️ SkyCast Roadmap

This document outlines the planned features and technical improvements for the SkyCast Weather Experience.

---

## 🟦 High Priority (Near-term)

### 1. Architectural Cleanup
- **Goal**: Improve maintainability by reducing `app.vue` complexity.
- **Tasks**:
  - Extract `WMO_CODES` and `BG_GRADIENTS` to `utils/weather.ts`.
  - Create `components/WeatherParticleFX.vue`.
  - Create `components/WeatherSearch.vue`.
  - Create `components/CurrentWeatherCard.vue`.

### 2. Localization & Units
- **Goal**: Make the app accessible to a global audience.
- **Tasks**:
  - Implement a `SettingsProvider` or use a simple `ref` for unit system.
  - Add conversion logic for Imperial units (°F, mph, in).
  - Add language support for weather condition labels.

---

## 🟨 Medium Priority (Mid-term)

### 3. User Experience (UX) Enhancements
- **Goal**: Make the app feel more personal and convenient.
- **Tasks**:
  - **Saved Cities**: Implement a "Favorite" button and a sidebar/list of saved locations.
  - **Auto-Refresh**: Implement background data fetching to keep forecasts fresh.
  - **Detailed Charts**: Use a lightweight charting library (like `chart.js` or `vue-chartjs`) for 24-hour temperature trends.

### 4. Expanded Data Points
- **Goal**: Provide more value per screen.
- **Tasks**:
  - **Air Quality**: Add Ozone, PM2.5, and PM10 levels.
  - **Moon Phases**: Visual representation of the current moon phase for night views.
  - **Sun Path**: A visual arc showing the sun's position relative to sunrise/sunset.

---

## 🟩 Low Priority (Long-term)

### 5. Advanced Visuals
- **Goal**: Push the limits of web aesthetics.
- **Tasks**:
  - **Lottie Animations**: Replace static SVGs with high-quality animated weather icons.
  - **Canvas Particles**: Optimize the particle system for performance on lower-end devices.
  - **Haptic Feedback**: Add subtle haptics for mobile users during interactions.

### 6. Social Integration
- **Goal**: Encourage sharing and growth.
- **Tasks**:
  - **Dynamic Open Graph**: Server-side rendered preview images for social media.
  - **Weather Alerts**: Integration with official weather warning systems.

---

## 🛠️ Technical Debt & Optimization
- [ ] Migrate to a more robust state management solution (e.g., Pinia) if complexity grows.
- [ ] Implement E2E testing with Playwright.
- [ ] Optimize build size by treeshaking unused SVG paths.
