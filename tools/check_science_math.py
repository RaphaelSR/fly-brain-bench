"""Symbolic audit of the guide's equations. Optional dev dependency: sympy==1.14.0.

Run: .venv/bin/python tools/check_science_math.py
No simulation, checkpoints, or files are modified.
"""
from sympy import symbols, exp, diff, simplify, log

t, tm, ts = symbols('t tm ts', positive=True)
v, v0, g = symbols('v v0 g', real=True)
conductance = g * exp(-t / ts)
voltage = v0 + (v - v0) * exp(-t / tm) + ts / (ts - tm) * (exp(-t / ts) - exp(-t / tm)) * g
assert simplify(tm * diff(voltage, t) - (v0 - voltage + conductance)) == 0
assert simplify(diff(conductance, t) + conductance / ts) == 0
assert simplify(voltage.subs(t, 0) - v) == 0
print('PASS: closed-form subthreshold LIF transition and initial condition (tm != ts)')

scores = symbols('s0:8', real=True)
temperature = symbols('T', positive=True)
denom = sum(exp(s / temperature) for s in scores)
probs = [exp(s / temperature) / denom for s in scores]
for k in range(8):
    expected = ((1 if k == 3 else 0) - probs[k]) / temperature
    assert simplify(diff(log(probs[3]), scores[k]) - expected) == 0
print('PASS: softmax log-probability gradient, including 1/T')

p, observed = symbols('p observed', real=True)
n, z = symbols('n z', positive=True)
centre = (observed + z**2 / (2*n)) / (1 + z**2 / n)
radius2 = z**2 * (observed * (1-observed) / n + z**2 / (4*n*n)) / (1 + z**2 / n)**2
score = n * (observed - p)**2 - z**2 * p * (1-p)
assert simplify(score - (n+z**2) * ((p-centre)**2 - radius2)) == 0
print('PASS: Wilson interval inverts the binomial score inequality')

stake = symbols('stake', nonnegative=True)
assert simplify(p * stake + (1-p) * (-stake) - stake * (2*p-1)) == 0
print('PASS: 2x gross return gives stake*(2*p-1) expected net points')
print('No claim of biological validation or independent arena trials follows from these identities.')
