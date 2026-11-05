import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LANDING_ROUTE,
  resolveLandingRoute,
} from '../src/game/landing/LandingPolicy.js';

test('original transition outranks deck-transfer filters', () => {
  assert.equal(resolveLandingRoute({
    originalTransition: true,
    geometryAware: true,
    abortToReturn: false,
    deckTargetMatches: false,
  }), LANDING_ROUTE.ORIGINAL_TRANSITION);
});

test('abort-to-return outranks deck target rejection', () => {
  assert.equal(resolveLandingRoute({
    geometryAware: true,
    abortToReturn: true,
    deckTargetMatches: false,
  }), LANDING_ROUTE.ABORT_TO_RETURN);
});

test('geometry-aware transfer outside deck target is rejected', () => {
  assert.equal(resolveLandingRoute({
    geometryAware: true,
    abortToReturn: false,
    deckTargetMatches: false,
  }), LANDING_ROUTE.REJECT_DECK_TARGET);
});

test('normal and valid deck landings use the standard route', () => {
  assert.equal(resolveLandingRoute(), LANDING_ROUTE.STANDARD);
  assert.equal(resolveLandingRoute({
    geometryAware: true,
    abortToReturn: false,
    deckTargetMatches: true,
  }), LANDING_ROUTE.STANDARD);
});
