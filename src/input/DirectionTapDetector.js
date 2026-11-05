export class DirectionTapDetector {
  constructor({ activation = 0.65, neutral = 0.30 } = {}) {
    this.activation = activation;
    this.neutral = neutral;
    this.reset();
  }

  reset() {
    this.xState = 0;
    this.yState = 0;
  }

  update(x = 0, y = 0) {
    const taps = [];
    this.xState = this.#axis(x, this.xState, 'left', 'right', taps);
    this.yState = this.#axis(y, this.yState, 'down', 'up', taps);
    return taps;
  }

  #axis(value, state, negativeName, positiveName, taps) {
    if (state !== 0) {
      if (Math.abs(value) <= this.neutral) return 0;
      return state;
    }
    if (value >= this.activation) {
      taps.push(positiveName);
      return 1;
    }
    if (value <= -this.activation) {
      taps.push(negativeName);
      return -1;
    }
    return 0;
  }
}
