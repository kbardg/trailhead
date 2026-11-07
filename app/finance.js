// Payment math. All money in dollars, rates in percent unless noted.
const Finance = (() => {
  // Fort Collins combined sales tax: CO 2.9% + Larimer County 0.8% + Fort Collins 3.85%.
  const DEFAULT_TAX = 7.55;
  const CREDIT_APR = { excellent: 6.49, good: 8.49, fair: 12.49 };      // typical new-car APR when no promo applies
  const CREDIT_MF = { excellent: 0.00250, good: 0.00300, fair: 0.00400 };
  // share of purchase price a typical vehicle is worth after N years (index = year)
  const VALUE_CURVE = [1, 0.82, 0.74, 0.67, 0.61, 0.56, 0.51, 0.47, 0.43];

  function loanPayment(principal, aprPct, months) {
    if (principal <= 0) return 0;
    const r = aprPct / 1200;
    return r === 0 ? principal / months : principal * r / (1 - Math.pow(1 + r, -months));
  }

  // Colorado first-year registration is mostly Specific Ownership Tax: 2.1% of 85% of MSRP, plus ~$150 in fees.
  const registrationEstimate = msrp => Math.round(msrp * 0.85 * 0.021 + 150);

  // residual guess when no published residual is available
  function residualGuess(months, miles) {
    let r = 58;
    r += { 24: 6, 36: 0, 39: -2, 48: -6 }[months] ?? 0;
    r += { 7500: 1, 10000: 0, 12000: -1, 15000: -3 }[miles] ?? 0;
    return r;
  }

  /**
   * d: { price, msrp, down, trade, rebates, dealerFee, taxRate, credit,
   *      loanApr, loanMonths, leaseMonths, leaseMiles, residualPct, moneyFactor, acqFee }
   */
  function compute(d) {
    const tax = d.taxRate / 100;
    const reg = registrationEstimate(d.msrp);
    const netPrice = Math.max(0, d.price - d.rebates);
    const taxable = Math.max(0, netPrice + d.dealerFee - d.trade);   // Colorado taxes the price net of trade-in
    const salesTax = taxable * tax;
    const otd = netPrice + d.dealerFee + salesTax + reg - d.trade;

    // finance
    const financed = Math.max(0, otd - d.down);
    const loanPmt = loanPayment(financed, d.loanApr, d.loanMonths);
    const loanTotal = loanPmt * d.loanMonths + d.down;
    const interest = loanPmt * d.loanMonths - financed;

    // lease — Colorado taxes each monthly payment
    const residual = d.msrp * d.residualPct / 100;
    const capCost = netPrice + d.dealerFee + d.acqFee - d.trade - d.down;
    const dep = (capCost - residual) / d.leaseMonths;
    const rent = (capCost + residual) * d.moneyFactor;
    const leaseBase = Math.max(0, dep + rent);
    const leasePmt = leaseBase * (1 + tax);
    const leaseDue = d.down + leasePmt + reg;
    const leaseTotal = leasePmt * d.leaseMonths + d.down + reg;

    // 8-year cash-out-of-pocket curves (excludes trade-in, which is the same in every scenario)
    const years = [...Array(9).keys()];
    const finCurve = years.map(y => [y, d.down + loanPmt * Math.min(y * 12, d.loanMonths)]);
    const cashCurve = years.map(y => [y, otd]);
    // a new lease (new due-at-signing) starts every leaseMonths
    const leaseCurve = [];
    for (let m = 0; m <= 96; m++) {
      const started = Math.floor(Math.min(m, 95) / d.leaseMonths) + 1;
      leaseCurve.push([m / 12, started * (d.down + reg) + leasePmt * m]);
    }
    const value = years.map(y => [y, netPrice * VALUE_CURVE[y]]);
    const v8 = netPrice * VALUE_CURVE[8];
    const end = c => c[c.length - 1][1];

    return {
      reg, salesTax, otd, netPrice,
      loan: { pmt: loanPmt, total: loanTotal, interest, financed, valueAtPayoff: netPrice * VALUE_CURVE[Math.min(8, Math.round(d.loanMonths / 12))] },
      lease: { pmt: leasePmt, due: leaseDue, total: leaseTotal, residual, effApr: d.moneyFactor * 2400 },
      cash: { total: otd, lostYield: otd * (Math.pow(1.04, 5) - 1) },
      curves: { fin: finCurve, lease: leaseCurve, cash: cashCurve, value },
      net8: { fin: end(finCurve) - v8, lease: end(leaseCurve), cash: otd - v8 },
    };
  }

  // quick "from $X/mo" estimates for cards and the Garage header
  function quick(price, msrp, credit = "excellent", offer = {}) {
    const r = compute({
      price, msrp, down: 5000, trade: 0, rebates: 0, dealerFee: 799, taxRate: DEFAULT_TAX, credit,
      loanApr: offer.apr ?? CREDIT_APR[credit], loanMonths: offer.aprMonths ?? 60,
      leaseMonths: 36, leaseMiles: 10000, residualPct: offer.residualPct ?? residualGuess(36, 10000),
      moneyFactor: offer.moneyFactor ?? CREDIT_MF[credit], acqFee: 650,
    });
    return { buy: r.loan.pmt, lease: r.lease.pmt };
  }

  return { compute, quick, loanPayment, residualGuess, registrationEstimate, DEFAULT_TAX, CREDIT_APR, CREDIT_MF };
})();
