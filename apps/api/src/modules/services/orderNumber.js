function nextServiceOrderNumber(numbers) {
  const highestSeq = numbers.reduce((highest, number) => {
    const match = /^OS-(\d+)$/.exec(number);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `OS-${String(highestSeq + 1).padStart(5, "0")}`;
}

module.exports = { nextServiceOrderNumber };
