"use strict";

const byId = id => document.getElementById(id);
const files = byId("files");
const stepSelect = byId("step");
const metricSelect = byId("metric");
const stepNames = ["epoch", "round", "step", "iteration", "轮次", "轮数", "步数"];
const palette = ["#245ed0", "#b75119", "#118363", "#8a48ae", "#9a3057", "#116f90"];
let entries = [];
let prepared = [];
let rendering = false;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  let closedQuote = false;
  const input = text.replace(/^\uFEFF/, "");

  function endField() {
    row.push(value.trim());
    value = "";
    closedQuote = false;
  }

  function endRow() {
    endField();
    if (row.length !== 1 || row[0] !== "") rows.push(row);
    row = [];
  }

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        value += char;
      }
    } else if (char === ",") {
      endField();
    } else if (char === "\r" || char === "\n") {
      endRow();
      if (char === "\r" && input[i + 1] === "\n") i++;
    } else if (char === '"' && !closedQuote && value.trim() === "") {
      value = "";
      quoted = true;
    } else if (closedQuote || char === '"') {
      if (!closedQuote || !/\s/.test(char)) throw new Error("CSV 引号格式有误。");
    } else {
      value += char;
    }
  }
  if (quoted) throw new Error("CSV 有未闭合的引号。");
  endRow();

  const header = rows.shift();
  if (!header || header.length < 2) throw new Error("需要逗号分隔的 CSV，至少有两列。");
  if (header.some(name => !name) || new Set(header).size !== header.length) {
    throw new Error("表头包含空列名或重复列名。");
  }
  if (!rows.length) throw new Error("CSV 只有表头，没有数据。");
  const invalidRow = rows.findIndex(cells => cells.length !== header.length);
  if (invalidRow !== -1) throw new Error("第 " + (invalidRow + 1) + " 条数据与表头列数不一致。");
  return {header, rows};
}

function decodeCsv(bytes) {
  try {
    return new TextDecoder("utf-8", {fatal: true}).decode(bytes);
  } catch {
    return new TextDecoder("gb18030", {fatal: true}).decode(bytes);
  }
}

function cellNumber(value) {
  if (!value || /^(nan|[+-]?inf(?:inity)?)$/i.test(value)) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function identifyStepOptions(runs) {
  const hasRecognizedName = runs.some(run =>
    run.header.some(name => stepNames.includes(name.toLowerCase())));
  const candidates = hasRecognizedName
    ? runs[0].header.filter(name => stepNames.includes(name.toLowerCase()))
    : runs[0].header;
  return candidates.filter(name => runs.every(run => {
    const column = run.header.indexOf(name);
    if (column === -1) return false;
    const steps = run.rows.map(row => cellNumber(row[column]));
    return steps.every(Number.isFinite) && new Set(steps).size === steps.length;
  }));
}

function initialStep(options) {
  for (const preferred of stepNames) {
    const matching = options.find(name => name.toLowerCase() === preferred);
    if (matching) return matching;
  }
  return "";
}

function prepareRun(run, stepName) {
  const stepIndex = run.header.indexOf(stepName);
  const rows = run.rows.map(row => ({step: cellNumber(row[stepIndex]), row}));
  rows.sort((a, b) => a.step - b.step);
  const metrics = new Map();
  run.header.forEach((name, column) => {
    if (column === stepIndex) return;
    const values = rows.map(({row}) => cellNumber(row[column]));
    if (values.some(Number.isNaN) || !values.some(Number.isFinite)) return;
    metrics.set(name, new Map(rows.map(({step}, index) => [step, values[index]])));
  });
  return {...run, steps: rows.map(({step}) => step), metrics};
}

function setOptions(select, options, selected, placeholder) {
  select.replaceChildren();
  if (placeholder) {
    select.add(new Option(placeholder, "", false, !selected));
    select.options[0].disabled = true;
  }
  for (const value of options) select.add(new Option(value, value, false, value === selected));
  select.disabled = !options.length;
}

function setStatus(message, isError = false) {
  const status = byId("file-status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function renderFiles() {
  const list = byId("file-list");
  list.replaceChildren();
  entries.forEach((entry, index) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = (index + 1) + ". " + entry.name;
    const info = document.createElement("small");
    info.textContent = entry.error || entry.rows.length + " 条记录";
    label.append(info);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.textContent = "移除";
    remove.setAttribute("aria-label", "移除 " + entry.name);
    remove.addEventListener("click", () => {
      entries = entries.filter(candidate => candidate !== entry);
      updateFiles();
    });
    item.append(label, remove);
    list.append(item);
  });
  list.hidden = !entries.length;
}

function updateFiles() {
  renderFiles();
  const valid = entries.filter(entry => !entry.error);
  const invalidCount = entries.length - valid.length;
  byId("clear").hidden = !entries.length;
  byId("example").hidden = entries.some(entry => !entry.example);
  const count = invalidCount ? "有 " + invalidCount + " 份文件无法读取，详见文件列表。" : "";
  const prompt = valid.length >= 2 ? "已读取 " + valid.length + " 份 CSV。" : "请至少添加两份有效 CSV。";
  setStatus(count + prompt, invalidCount > 0);
  byId("comparison").hidden = valid.length < 2;
  if (valid.length < 2) return;

  const options = identifyStepOptions(valid);
  const previous = stepSelect.value;
  const selected = options.includes(previous) ? previous : initialStep(options);
  setOptions(stepSelect, options, selected,
    options.length ? (selected ? "" : "请选择轮次列") : "无可用轮次列");
  updateMetrics();
}

function updateMetrics() {
  const coverage = byId("coverage");
  coverage.replaceChildren();
  byId("coverage-details").hidden = true;
  byId("metric-view").hidden = true;
  const step = stepSelect.value;
  if (!step) {
    setOptions(metricSelect, [], "", "无");
    byId("comparison-status").textContent = stepSelect.disabled
      ? "没有可用的共同轮次列。请统一各文件的轮次列名，并检查轮次是否为数字、是否重复。"
      : "未识别到常见轮次列名。请手动选择实际的轮次列。";
    return;
  }

  prepared = entries.flatMap((entry, index) =>
    entry.error ? [] : [prepareRun({...entry, fileNumber: index + 1}, step)]);
  const allColumns = new Set(prepared.flatMap(run => run.header.filter(name => name !== step)));
  const common = [...allColumns].filter(name => prepared.every(run => run.metrics.has(name)));
  const previous = metricSelect.value;
  setOptions(metricSelect, common, common.includes(previous) ? previous : common[0],
    common.length ? "" : "无共同数值指标");
  const note = common.length
    ? "识别到 " + common.length + " 个共同数值指标。请确认同名指标的定义、单位和验证集一致。"
    : "这些文件没有全部共有的同名数值列。可在下方查看各列在哪些文件中缺失或不可用。";
  byId("comparison-status").textContent = note;
  for (const name of allColumns) {
    if (common.includes(name)) continue;
    const missing = prepared.flatMap(run => run.header.includes(name) ? [] : [run.fileNumber]);
    const unsuitable = prepared.flatMap(run =>
      run.header.includes(name) && !run.metrics.has(name) ? [run.fileNumber] : []);
    const messages = [];
    if (missing.length) messages.push("第 " + missing.join("、") + " 份缺少该列");
    if (unsuitable.length) messages.push("第 " + unsuitable.join("、") + " 份含文本或缺少有效数值");
    const item = document.createElement("li");
    item.textContent = name + " · " + messages.join("；");
    coverage.append(item);
  }
  byId("coverage-details").hidden = !coverage.childElementCount;
  renderMetric();
}

const number = value => Number.isFinite(value) ? Number(value.toPrecision(8)).toString() : "超出数值范围";

function svgNode(tag, attributes, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function scale(value, low, high, start, end) {
  if (low === high) return (start + end) / 2;
  const fraction = Number.isFinite(high - low)
    ? (value - low) / (high - low)
    : (value / 2 - low / 2) / (high / 2 - low / 2);
  return start + (end - start) * fraction;
}

function renderChart(metric, stepName) {
  const left = 88, right = 906, top = 18, bottom = 247;
  const steps = [...new Set(prepared.flatMap(run => run.steps))].sort((a, b) => a - b);
  let low = Infinity, high = -Infinity;
  for (const run of prepared) {
    for (const value of run.metrics.get(metric).values()) {
      if (value === null) continue;
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
  }
  const x = step => scale(step, steps[0], steps[steps.length - 1], left, right);
  const y = value => scale(value, low, high, bottom, top);
  const svg = svgNode("svg", {viewBox: "0 0 960 310", role: "img", "aria-label": metric + " 的实验对比曲线"});
  for (const fraction of low === high ? [0] : [0, .25, .5, .75, 1]) {
    const value = low * (1 - fraction) + high * fraction;
    const position = y(value);
    svg.append(svgNode("path", {class: "grid", d: "M" + left + "," + position + " H" + right}),
      svgNode("text", {x: left - 9, y: position + 4, "text-anchor": "end"}, number(value)));
  }
  const ticks = Math.min(6, steps.length);
  for (let i = 0; i < ticks; i++) {
    const tick = steps[Math.round(i * (steps.length - 1) / Math.max(1, ticks - 1))];
    const position = x(tick);
    svg.append(svgNode("path", {class: "grid", d: "M" + position + "," + top + " V" + bottom}),
      svgNode("text", {x: position, y: bottom + 21, "text-anchor": "middle"}, number(tick)));
  }
  svg.append(svgNode("text", {x: (left + right) / 2, y: 298, "text-anchor": "middle"}, stepName));
  const legend = byId("legend");
  legend.replaceChildren();
  prepared.forEach((run, index) => {
    const color = palette[index % palette.length];
    const style = ["", "8 4", "3 4"][Math.floor(index / palette.length) % 3];
    const values = run.metrics.get(metric);
    const label = document.createElement("span");
    const dot = document.createElement("i");
    dot.className = "dot";
    dot.style.background = color;
    label.append(dot, run.fileNumber + ". " + run.name);
    legend.append(label);
    const commands = [];
    const markers = [];
    let previous = false;
    run.steps.forEach((step, position) => {
      const value = values.get(step);
      if (value === null) {
        previous = false;
        return;
      }
      const cx = x(step), cy = y(value);
      commands.push((previous ? "L" : "M") + cx.toFixed(2) + "," + cy.toFixed(2));
      const next = position + 1 < run.steps.length && values.get(run.steps[position + 1]) !== null;
      if (run.steps.length <= 120 || !(previous || next)) {
        const dot = svgNode("circle", {cx, cy, r: 3, fill: color});
        dot.append(svgNode("title", {}, run.name + " · " + stepName + " " + number(step) + " · " + number(value)));
        markers.push(dot);
      }
      previous = true;
    });
    svg.append(svgNode("path", {d: commands.join(" "), fill: "none", stroke: color,
      "stroke-width": 2.4, "stroke-linecap": "round", "stroke-dasharray": style}));
    for (const marker of markers) svg.append(marker);
  });
  byId("chart").replaceChildren(svg);
}

function renderMetric() {
  const metric = metricSelect.value;
  byId("metric-view").hidden = !metric;
  if (!metric) return;
  const stepName = stepSelect.value;
  renderChart(metric, stepName);

  const snapshot = byId("snapshot");
  snapshot.replaceChildren();
  const shared = prepared[0].steps.filter(step => prepared.every(run =>
    Number.isFinite(run.metrics.get(metric).get(step))));
  const last = shared[shared.length - 1];
  byId("snapshot-note").textContent = last === undefined
    ? "这个指标没有所有实验都有数值的共同轮次。曲线仍显示各自已有的结果。"
    : stepName + " = " + number(last) + "，这是所有实验在此指标上都有数值的最大轮次。";
  snapshot.closest("table").hidden = last === undefined;
  if (last === undefined) return;
  const baseline = prepared[0].metrics.get(metric).get(last);
  prepared.forEach((run, index) => {
    const value = run.metrics.get(metric).get(last);
    const tr = document.createElement("tr");
    [run.fileNumber + ". " + run.name, number(value), index === 0 ? "基准" : number(value - baseline)]
      .forEach((text, cellIndex) => {
        const cell = document.createElement(cellIndex === 0 ? "th" : "td");
        if (cellIndex === 0) cell.scope = "row";
        cell.textContent = text;
        tr.append(cell);
      });
    snapshot.append(tr);
  });
}

async function addFiles(selected) {
  if (rendering || !selected.length) return;
  rendering = true;
  byId("choose").disabled = true;
  byId("example").disabled = true;
  byId("clear").disabled = true;
  setStatus("正在读取 CSV…");
  try {
    const imported = await Promise.all([...selected].map(async file => {
      const key = [file.name, file.size, file.lastModified].join("\u0000");
      try {
        return {name: file.name, key, ...parseCsv(decodeCsv(await file.arrayBuffer()))};
      } catch (error) {
        return {name: file.name, key, error: error.message};
      }
    }));
    entries = entries.filter(entry => !entry.example);
    for (const entry of imported) {
      if (!entries.some(existing => existing.key === entry.key)) entries.push(entry);
    }
    updateFiles();
  } finally {
    rendering = false;
    byId("choose").disabled = false;
    byId("example").disabled = false;
    byId("clear").disabled = false;
  }
}

const exampleRuns = [
  ["示例 A.csv", "epoch,val_loss,val_accuracy,notes\n1,.76,.60,baseline\n2,.56,.71,baseline\n3,.47,.78,baseline\n4,.41,.82,baseline\n5,.40,.83,baseline"],
  ["示例 B.csv", "epoch,val_loss,val_accuracy\n1,.81,.58\n2,.55,.73\n3,.42,.80\n4,.37,.85\n5,.34,.88"],
  ["示例 C.csv", "epoch,val_loss,val_accuracy\n1,.73,.63\n2,.59,.69\n3,.44,.79\n4,.39,.84"]
];

byId("choose").addEventListener("click", () => files.click());
files.addEventListener("change", () => {
  addFiles([...files.files]);
  files.value = "";
});
byId("example").addEventListener("click", () => {
  for (const [name, text] of exampleRuns) {
    const key = "example:" + name;
    if (!entries.some(entry => entry.key === key)) entries.push({name, key, example: true, ...parseCsv(text)});
  }
  updateFiles();
});
byId("clear").addEventListener("click", () => {
  entries = [];
  updateFiles();
});
stepSelect.addEventListener("change", updateMetrics);
metricSelect.addEventListener("change", renderMetric);
const drop = byId("drop");
for (const eventName of ["dragenter", "dragover"]) {
  drop.addEventListener(eventName, event => {
    event.preventDefault();
    drop.classList.add("active");
  });
}
drop.addEventListener("dragleave", event => {
  if (!drop.contains(event.relatedTarget)) drop.classList.remove("active");
});
drop.addEventListener("drop", event => {
  event.preventDefault();
  drop.classList.remove("active");
  addFiles(event.dataTransfer.files);
});
