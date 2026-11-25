# 实验结果对比 / Experiment Results Comparison

[中文](#中文) · [English](#english)

## 中文

之前做迁移学习、数据增强和人脸识别实验时，我经常要把新结果和基线放在一起看。每次手动对轮次、画图、算差值有点麻烦，我就做了这个小工具。

它可以读取两份或更多 CSV，把共同的指标按轮次画在同一张图上，并列出最近共同轮次的指标值和相对基线的差值。文件只在当前浏览器里读取。

### 怎么用

1. 把项目文件放在同一个文件夹里，用浏览器打开 [index.html](./index.html)。无需安装依赖。
2. 点「试用示例」直接看效果，也可以选择或拖入自己的 CSV。第一份有效文件会作为基线，建议先单独添加基线文件。
3. 在「轮次列」和「显示指标」里选择要比较的内容。图下方会显示所有实验在该指标上都有数值的最大轮次，以及各实验在这一轮的数值。差值按「实验值减去基线值」计算。

### CSV 怎么准备

每份 CSV 第一行是列名。参与比较的文件需要有同名的轮次列（例如 `epoch`）和同名的数值指标列。轮次必须是数字，且在每份文件内不能重复。比较之前，确认同名指标的定义、单位和评估数据一致。

基线示例：

```csv
epoch,val_loss,val_accuracy
1,0.76,0.60
2,0.71,0.65
```

新实验示例：

```csv
epoch,val_loss,val_accuracy
1,0.72,0.63
2,0.65,0.69
```

选 `val_accuracy` 时，表格会对比第 2 轮，新实验比基线高 `0.04`，也就是 4 个百分点。

## English

When I ran experiments on transfer learning, data augmentation, and face recognition, I often needed to compare a new run with a baseline. Lining up training steps, plotting metrics, and calculating differences by hand got repetitive, so I made this small tool.

It reads two or more CSV files, plots their shared metrics by training step, and shows each run's value and its difference from the baseline at the latest shared step. Files are read locally in your browser.

### How to use it

1. Keep the project files in the same folder and open [index.html](./index.html) in your browser. There are no dependencies to install.
2. Click **试用示例** (Try examples), or select or drag in your own CSV files. The first valid file is the baseline, so add it on its own first if you want to choose it explicitly.
3. Choose a step column (**轮次列**) and a metric (**显示指标**). The table below the chart shows the latest step where every run has a value for that metric. Each difference is the run's value minus the baseline value.

### CSV format

Put column names in the first row. The files need a step column with the same name (such as `epoch`) and at least one shared numeric metric column. Step values must be numeric and unique within each file. Before comparing runs, check that metrics with the same name use the same definition, units, and evaluation data.

For the two CSV examples above, selecting `val_accuracy` compares the runs at epoch 2. The new run is `0.04`, or 4 percentage points, above the baseline.

