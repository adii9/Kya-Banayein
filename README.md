# Kya Banayein?

A household meal-planning app for Indian kitchens. Plan tonight's dinner, track the kitchen, and know exactly what to buy — weekly for fresh food, monthly for staples.

## Stack

- Vite + React + TypeScript
- Web Speech API (browser-native STT/TTS, no external service)
- LocalStorage persistence
- Installable PWA

## Run

```bash
npm install
npm run dev
```

## Test

```bash
npm test
```

## Build

```bash
npm run build
```

## Features

- User-chosen number of meal suggestions and dishes per meal
- Pantry-aware meal recommendations
- Automatic inventory deduction on confirm
- Editable kitchen inventory
- Weekly fresh-food and monthly staple reorder lists
- Multi-language chat assistant (Hindi, Bengali, Tamil, Telugu, Kannada, Marathi, Gujarati, Malayalam, Punjabi, English) with voice input
- Pure-vegetarian household rule
- Per-household dislike list
- Persistent storage, PWA-ready

## Assistant language support

The chat assistant accepts voice or text input in any of the listed regional languages. Browser support for STT varies; Chrome and Edge cover the widest set of Indic locales.
