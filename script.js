
"use strict";

(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
    model: $("model"),
    p: $("p"),
    pValue: $("p-value"),
    pControl: $("p-control"),
    n: $("n"),
    nValue: $("n-value"),
    runs: $("runs"),
    runsValue: $("runs-value"),
    m: $("m"),
    epsilon: $("epsilon"),
    run: $("run-btn"),
    reset: $("reset-btn"),
    status: $("status")
  };

  const COLORS = {
  blue: "#244B43",  
  green: "#B58A37",  
  orange: "#B58A37", 
  muted: "#617D79",  
  grid: "#DCE8DD",   
  ink: "#203C3A"     
};

  let lastResults = null;
  let resizeTimer = null;

  function getParams() {
    return {
      model: el.model.value,
      p: Number(el.p.value),
      n: Math.max(1, Math.floor(Number(el.n.value) || 100)),
      runs: Math.max(1, Math.floor(Number(el.runs.value) || 1000)),
      m: Math.max(1, Math.floor(Number(el.m.value) || 1)),
      epsilon: Number(el.epsilon.value)
    };
  }

  function theoretical(model, p) {
    if (model === "bernoulli") {
      return { mu: p, variance: p * (1 - p) };
    }
    return { mu: 0, variance: 1 };
  }

  function updateControls() {
    el.pControl.classList.toggle("hidden", el.model.value !== "bernoulli");
    el.pValue.textContent = Number(el.p.value).toFixed(2);
    el.nValue.textContent = Number(el.n.value).toLocaleString();
    el.runsValue.textContent = Number(el.runs.value).toLocaleString();
  }

  function randomIncrement(model, p) {
    if (model === "bernoulli") return Math.random() < p ? 1 : 0;
    return Math.random() < 0.5 ? 1 : -1;
  }

  function simulate(params) {
    const { model, p, n, runs } = params;
    const paths = [];
    const finalScores = new Array(runs);
    const averages = new Array(runs);
    const scaled = new Array(runs);
    const standardized = new Array(runs);
    const theory = theoretical(model, p);

    // Limit the number of plotted paths to keep the chart readable.
    const pathCount = Math.min(24, runs);
    const pathIndices = new Set();
    while (pathIndices.size < pathCount) {
      pathIndices.add(Math.floor(Math.random() * runs));
    }

    const sortedIndices = [...pathIndices].sort((a, b) => a - b);
    const pathMap = new Map(sortedIndices.map((index) => [index, []]));

    for (let r = 0; r < runs; r++) {
      let sum = 0;
      const storePath = pathMap.has(r);

      if (storePath) pathMap.get(r).push(0);

      for (let k = 1; k <= n; k++) {
        sum += randomIncrement(model, p);
        if (storePath) pathMap.get(r).push(sum);
      }

      finalScores[r] = sum;
      averages[r] = sum / n;
      scaled[r] = sum / Math.sqrt(n);

      if (theory.variance > 0) {
        standardized[r] =
          (sum - n * theory.mu) /
          Math.sqrt(n * theory.variance);
      } else {
        standardized[r] = 0;
      }
    }

    for (const index of sortedIndices) {
      paths.push(pathMap.get(index));
    }

    const mean = meanOf(finalScores);
    const variance = varianceOf(finalScores, mean);
    const avgMean = meanOf(averages);
    const avgVariance = varianceOf(averages, avgMean);
    const scaledMean = meanOf(scaled);
    const scaledVariance = varianceOf(scaled, scaledMean);
    const zMean = meanOf(standardized);
    const zVariance = varianceOf(standardized, zMean);

    let withinTolerance = 0;
    for (const value of averages) {
      if (Math.abs(value - theory.mu) < params.epsilon) {
        withinTolerance++;
      }
    }

    const empiricalProbability = withinTolerance / runs;
    const bound = Math.min(
      1,
      theory.variance / (n * params.epsilon * params.epsilon)
    );

    return {
      params,
      theory,
      paths,
      finalScores,
      averages,
      scaled,
      standardized,
      stats: {
        mean,
        variance,
        avgMean,
        avgVariance,
        scaledMean,
        scaledVariance,
        zMean,
        zVariance,
        empiricalProbability,
        bound
      }
    };
  }

  function meanOf(values) {
    if (!values.length) return 0;
    let sum = 0;
    for (const value of values) sum += value;
    return sum / values.length;
  }

  function varianceOf(values, mean) {
    if (!values.length) return 0;
    let sum = 0;
    for (const value of values) sum += (value - mean) ** 2;
    return sum / values.length;
  }

  function fmt(value, digits = 4) {
    if (!Number.isFinite(value)) return "—";
    if (Math.abs(value) >= 10000) return value.toExponential(2);
    return value.toFixed(digits);
  }

  function setText(id, value) {
    $(id).textContent = value;
  }

  function updateMetrics(result) {
    const { params, theory, stats } = result;
    setText("metric-mean", fmt(stats.mean));
    setText("metric-mean-theory", `Theory: ${fmt(params.n * theory.mu)}`);
    setText("metric-var", fmt(stats.variance));
    setText("metric-var-theory", `Theory: ${fmt(params.n * theory.variance)}`);
    setText("metric-avgvar", fmt(stats.avgVariance));
    setText("metric-avgvar-theory", `Theory: ${fmt(theory.variance / params.n)}`);
    setText("metric-normvar", fmt(stats.scaledVariance));
    setText("metric-normvar-theory", `Theory: ${fmt(theory.variance)}`);

    setText("lln-mu", fmt(theory.mu));
    setText(
      "lln-prob",
      `${(stats.empiricalProbability * 100).toFixed(1)}%`
    );
    setText("lln-bound", `${(stats.bound * 100).toFixed(1)}%`);

    const { epsilon, n } = params;
    let interpretation;

    if (stats.empiricalProbability > 0.9) {
      interpretation =
        `In this experiment, ${(stats.empiricalProbability * 100).toFixed(1)}% of sample averages lie within ε = ${epsilon} of μ. This is consistent with concentration around the mean, although one simulation does not prove convergence.`;
    } else {
      interpretation =
        `Only ${(stats.empiricalProbability * 100).toFixed(1)}% of sample averages lie within ε = ${epsilon} of μ. Try increasing n. The LLN predicts that this probability approaches 100% as n grows.`;
    }

    if (n < 100) {
      interpretation += " With a relatively small sample size, fluctuations may still be noticeable.";
    }

    setText("lln-interpretation", interpretation);
  }

  // Canvas drawing utilities. Canvas dimensions are scaled for high-density screens.
  function prepareCanvas(id, height = 245) {
    const canvas = $(id);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width || 500));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    return { canvas, ctx, width, height };
  }

  function drawAxes(ctx, width, height, bounds, xLabel, yLabel) {
    const { left, right, top, bottom, xMin, xMax, yMin, yMax } = bounds;
    const plotW = width - left - right;
    const plotH = height - top - bottom;

    const xPos = (x) => left + ((x - xMin) / (xMax - xMin || 1)) * plotW;
    const yPos = (y) => top + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH;

    ctx.font = "10px DM Sans, sans-serif";
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.muted;

    for (let i = 0; i <= 4; i++) {
      const y = top + (plotH * i) / 4;
      const value = yMax - ((yMax - yMin) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(formatTick(value), left - 7, y);
    }

    for (let i = 0; i <= 4; i++) {
      const x = left + (plotW * i) / 4;
      const value = xMin + ((xMax - xMin) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + plotH);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(formatTick(value), x, top + plotH + 7);
    }

    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "11px DM Sans, sans-serif";
    ctx.fillText(xLabel, left + plotW / 2, height - 1);

    ctx.save();
    ctx.translate(12, top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    return { xPos, yPos, plotW, plotH };
  }

  function formatTick(value) {
    if (Math.abs(value) >= 1000) return Math.round(value).toString();
    if (Math.abs(value) >= 100) return Math.round(value).toString();
    if (Math.abs(value) >= 10) return value.toFixed(0);
    return Number(value.toFixed(2)).toString();
  }

  function drawPaths(result) {
    const { ctx, width, height } = prepareCanvas("paths", 245);
    const { paths, params, theory } = result;
    const n = params.n;

    let min = 0;
    let max = 0;
    for (const path of paths) {
      for (const value of path) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }

    const expectedEnd = n * theory.mu;
    min = Math.min(min, expectedEnd);
    max = Math.max(max, expectedEnd);

    const range = Math.max(1, max - min);
    const padding = range * 0.08;
    min -= padding;
    max += padding;

    const bounds = {
      left: 48, right: 14, top: 15, bottom: 34,
      xMin: 0, xMax: n, yMin: min, yMax: max
    };
    const map = drawAxes(ctx, width, height, bounds, "Step k", "Score Sₖ");

    const palette = [COLORS.blue, COLORS.green, COLORS.orange, "#9272d5"];
    paths.forEach((path, index) => {
      ctx.beginPath();
      ctx.strokeStyle = palette[index % palette.length];
      ctx.lineWidth = 1.25;
      ctx.globalAlpha = 0.75;

      const stride = Math.max(1, Math.floor(path.length / 500));
      for (let i = 0; i < path.length; i += stride) {
        const x = map.xPos(i);
        const y = map.yPos(path[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if ((path.length - 1) % stride !== 0) {
        ctx.lineTo(map.xPos(n), map.yPos(path[path.length - 1]));
      }
      ctx.stroke();
    });

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.moveTo(map.xPos(0), map.yPos(0));
    ctx.lineTo(map.xPos(n), map.yPos(expectedEnd));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function makeHistogram(values, binCount = 35, fixedRange = null) {
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (fixedRange) {
      min = fixedRange[0];
      max = fixedRange[1];
    } else {
      if (min === max) {
        min -= 0.5;
        max += 0.5;
      }
      const pad = (max - min) * 0.04;
      min -= pad;
      max += pad;
    }

    const width = (max - min) / binCount;
    const counts = new Array(binCount).fill(0);

    for (const value of values) {
      if (value < min || value > max) continue;
      const index = Math.min(
        binCount - 1,
        Math.max(0, Math.floor((value - min) / width))
      );
      counts[index]++;
    }

    return {
      min,
      max,
      width,
      counts,
      density: counts.map((count) => count / (values.length * width)),
      binCount
    };
  }

  function drawHistogram(id, values, options = {}) {
    const { ctx, width, height } = prepareCanvas(id, 245);
    const hist = makeHistogram(
      values,
      options.binCount || 35,
      options.range || null
    );

    const maxDensity = Math.max(...hist.density, 0.01);
    const curveMax = options.normalCurve ? 0.42 : 0;
    const yMax = Math.max(maxDensity, curveMax) * 1.2;

    const bounds = {
      left: 48, right: 15, top: 15, bottom: 35,
      xMin: hist.min, xMax: hist.max, yMin: 0, yMax
    };

    const map = drawAxes(ctx, width, height, bounds, options.xLabel || "Value", "Density");

    ctx.fillStyle = options.color || COLORS.blue;
    for (let i = 0; i < hist.binCount; i++) {
      const x0 = map.xPos(hist.min + i * hist.width);
      const x1 = map.xPos(hist.min + (i + 1) * hist.width);
      const y = map.yPos(hist.density[i]);
      ctx.globalAlpha = 0.78;
      ctx.fillRect(x0 + 0.5, y, Math.max(1, x1 - x0 - 1), map.yPos(0) - y);
    }
    ctx.globalAlpha = 1;

    if (Number.isFinite(options.reference)) {
      const x = map.xPos(options.reference);
      ctx.beginPath();
      ctx.strokeStyle = COLORS.orange;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.moveTo(x, bounds.top);
      ctx.lineTo(x, height - bounds.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (options.normalCurve) {
      const curveMin = Math.max(hist.min, -4);
      const curveMaxX = Math.min(hist.max, 4);
      ctx.beginPath();
      ctx.strokeStyle = COLORS.green;
      ctx.lineWidth = 2.5;

      let started = false;
      const steps = 160;
      for (let i = 0; i <= steps; i++) {
        const x = curveMin + ((curveMaxX - curveMin) * i) / steps;
        const density = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
        const px = map.xPos(x);
        const py = map.yPos(density);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }

    if (options.normalCurve) {
      ctx.font = "10px DM Sans, sans-serif";
      ctx.fillStyle = COLORS.blue;
      ctx.fillText("Empirical", bounds.left + 7, bounds.top + 12);
      ctx.fillStyle = COLORS.green;
      ctx.fillText("N(0,1)", bounds.left + 75, bounds.top + 12);
    }

    return hist;
  }

  function drawAll(result) {
    drawPaths(result);

    drawHistogram("hist-s", result.finalScores, {
      color: COLORS.blue,
      xLabel: "Final score Sₙ",
      binCount: Math.min(45, Math.max(15, Math.ceil(Math.sqrt(result.params.runs))))
    });

    drawHistogram("hist-avg", result.averages, {
      color: COLORS.blue,
      xLabel: "Average Sₙ / n",
      reference: result.theory.mu,
      binCount: 35
    });

    drawHistogram("hist-norm", result.scaled, {
      color: COLORS.blue,
      xLabel: "Scaled score Sₙ / √n",
      reference: result.params.model === "rademacher" ? 0 : undefined,
      binCount: 35
    });

    drawHistogram("hist-z", result.standardized, {
      color: COLORS.blue,
      xLabel: "Standardized score Zₙ",
      range: [-4, 4],
      normalCurve: true,
      binCount: 32
    });
  }

  function runSimulation() {
    const params = getParams();

    if (!Number.isFinite(params.m) || params.m < 1) {
      el.status.textContent = "Please enter a number of attackers greater than or equal to 1.";
      return;
    }

    el.run.disabled = true;
    el.status.textContent = "Simulating independent trajectories…";

    // Defer the computation by one frame so the status can render first.
    requestAnimationFrame(() => {
      try {
        lastResults = simulate(params);
        updateMetrics(lastResults);
        drawAll(lastResults);

        el.status.textContent =
          `${params.runs.toLocaleString()} trajectories generated · n = ${params.n} · m = ${params.m}.`;
      } catch (error) {
        console.error(error);
        el.status.textContent = "The simulation encountered an error. Please try again.";
      } finally {
        el.run.disabled = false;
      }
    });
  }

  function resetDefaults() {
    el.model.value = "rademacher";
    el.p.value = "0.5";
    el.n.value = "100";
    el.runs.value = "1000";
    el.m.value = "10";
    el.epsilon.value = "0.1";
    updateControls();
    runSimulation();
  }

  el.model.addEventListener("change", () => {
    updateControls();
    runSimulation();
  });

  [el.p, el.n, el.runs, el.epsilon].forEach((input) => {
    input.addEventListener("input", updateControls);
    input.addEventListener("change", runSimulation);
  });

  el.m.addEventListener("change", runSimulation);
  el.run.addEventListener("click", runSimulation);
  el.reset.addEventListener("click", resetDefaults);

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (lastResults) drawAll(lastResults);
    }, 150);
  });

  // Initial state.
  updateControls();

  // Wait for web fonts to load, if supported, before drawing labels.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(runSimulation);
  } else {
    runSimulation();
  }
})();
