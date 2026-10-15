export const METHODOLOGY = [
  { title: 'Problem', body: 'Estimate the probability that a county reaches Crisis or worse in a given period.' },
  { title: 'Dataset', body: 'County observations across historical periods. Counts describe this dataset only, not every possible observation.' },
  { title: 'Target', body: 'Crisis-or-worse versus below Crisis.' },
  { title: 'Features', body: 'Ten inputs: location, population, timing, prior IPC phase and Phase 3+ share, prior-year cereal production and gap, and prior severity.' },
  { title: 'Feature engineering', body: 'Prior-period and prior-year values only. Encoding and scaling live inside the exported scikit-learn pipeline, so research and production cannot drift apart.' },
  { title: 'Leakage prevention', body: 'Nothing from the target period or later reaches training or inference.' },
  { title: 'Temporal validation', body: 'Train on earlier periods, test on the next. Rows are never shuffled across time. ROC-AUC is reported per fold.' },
  { title: 'Model selection', body: 'Balanced logistic regression, C = 1.0, chosen on ROC-AUC. C = 100 is kept as a robustness check, not a second production model.' },
  { title: 'Error analysis', body: 'Per-fold results are reviewed for unstable periods and for counties with limited history.' },
  { title: 'Limitations', body: 'Probabilities are not validated as calibrated, so they are never presented as confidence. Performance may drop on counties or periods unlike the training data.' },
  { title: 'Reproducibility', body: 'Training, evaluation and export scripts live with the model. Every artifact is checksummed and verified before it is loaded.' },
] as const;
