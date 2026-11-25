// The quiet line a permission leaves once someone decided it.
export function decisionText(data) {
  const head =
    data.isApproved && data.note
      ? 'Allowed with your change'
      : data.isApproved
        ? data.reach === 'always'
          ? 'Always allowed · lasts 90 days'
          : 'Allowed until the task ends'
        : data.isSuperseded
          ? 'Left undecided: you wrote first'
          : 'Declined';
  return `${head}${data.summary ? ` · ${data.summary}` : ''}${data.note ? ` · "${data.note}"` : ''}`;
}
