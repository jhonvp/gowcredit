/**
 * Multinomial logistic regression (softmax), dependency-free. Training runs in
 * scripts/train-classifier.ts; the runtime only predicts with the exported weights.
 */
export interface SoftmaxModel {
  classes: readonly string[];
  features: readonly string[];
  mean: number[];
  std: number[];
  /** weights[class][feature]; the last column is the bias. */
  weights: number[][];
}

const standardize = (x: number[], m: SoftmaxModel) =>
  x.map((v, j) => (v - (m.mean[j] ?? 0)) / (m.std[j] || 1));

export function probabilities(m: SoftmaxModel, x: number[]): number[] {
  const z = standardize(x, m);
  const logits = m.weights.map((w) => z.reduce((a, v, j) => a + v * (w[j] ?? 0), w[z.length] ?? 0));
  const max = Math.max(...logits);
  const exp = logits.map((l) => Math.exp(l - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map((e) => e / sum);
}

export function predict(m: SoftmaxModel, x: number[]): { label: string; p: number } {
  const p = probabilities(m, x);
  const best = p.indexOf(Math.max(...p));
  return { label: m.classes[best] as string, p: p[best] as number };
}

/** Full-batch gradient descent with L2 and per-class weights (the classes are very unbalanced). */
export function train(
  X: number[][],
  y: number[],
  classes: readonly string[],
  features: readonly string[],
  opts = { epochs: 400, lr: 0.5, l2: 1e-3 },
): SoftmaxModel {
  const d = features.length;
  const k = classes.length;
  const mean = Array.from(
    { length: d },
    (_, j) => X.reduce((a, x) => a + (x[j] ?? 0), 0) / X.length,
  );
  const std = Array.from({ length: d }, (_, j) =>
    Math.sqrt(X.reduce((a, x) => a + ((x[j] ?? 0) - (mean[j] ?? 0)) ** 2, 0) / X.length),
  );
  const model: SoftmaxModel = {
    classes,
    features,
    mean,
    std,
    weights: Array.from({ length: k }, () => new Array<number>(d + 1).fill(0)),
  };
  const counts = classes.map((_, c) => y.filter((v) => v === c).length);
  const classWeight = counts.map((n) => (n ? X.length / (k * n) : 0));
  const Z = X.map((x) => standardize(x, model));

  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    const grad = Array.from({ length: k }, () => new Array<number>(d + 1).fill(0));
    let wsum = 0;
    Z.forEach((z, i) => {
      const p = probabilities(
        { ...model, mean: new Array(d).fill(0), std: new Array(d).fill(1) },
        z,
      );
      const yi = y[i] as number;
      const w = classWeight[yi] as number;
      wsum += w;
      for (let c = 0; c < k; c++) {
        const err = w * ((p[c] as number) - (c === yi ? 1 : 0));
        const g = grad[c] as number[];
        for (let j = 0; j < d; j++) g[j] = (g[j] as number) + err * (z[j] as number);
        g[d] = (g[d] as number) + err;
      }
    });
    model.weights.forEach((w, c) => {
      const g = grad[c] as number[];
      for (let j = 0; j <= d; j++)
        w[j] =
          (w[j] as number) -
          opts.lr * ((g[j] as number) / wsum + (j < d ? opts.l2 * (w[j] as number) : 0));
    });
  }
  return model;
}
