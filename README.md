# Wealth Management & Portfolio Rebalancing Engine (PoC)
🚀 **Live Demo:** [Click here to access the running system](https://investments-demo.netlify.app/#)

## 📌 Overview
This project is a Proof of Concept (PoC) for a comprehensive Wealth Management system. Born from the need to solve real-world asset allocation and tax calculation challenges, it has evolved into a robust financial logic engine. 

Initially engineered to solve the operational complexities of tracking multi-broker custody and maintaining average price integrity, the system later evolved to incorporate advanced performance analytics. It is built with an **Offline-First / LocalStorage architecture** to ensure maximum user privacy and zero latency during heavy scenario simulations.

---

## ⚙️ Core Architecture & Problems Solved (The Foundation)

### 1. Multi-Broker Consolidation & Average Price Integrity
* Maintains rigorous mathematical accuracy for the Average Price (*Preço Médio*) across multiple checking and investment accounts. 
* Seamlessly handles **Custody Transfers** between different brokers, ensuring historical average prices and position integrity remain completely intact without data loss.

### 2. Time-Travel State (Historical Snapshots)
* Features a robust querying engine capable of reconstructing the exact portfolio position, valuation, and asset distribution at any specific date in the past—crucial for auditing and historical reconciliation.

### 3. Corporate Actions Engine
* Automatically processes and adjusts historical average prices and share quantities resulting from complex corporate events, such as **Stock Splits** and **Reverse Splits** (*Grupamentos*).

### 4. T+2 Settlement & Trade Management
* Incorporates banking holiday calendars to accurately calculate T+2 (D+2) settlement dates for variable income operations.
* **Simulated vs. Manual Ledgers:** Trades can be inputted manually or generated automatically via a "Scenario Simulator" that projects the impact of a trade before execution.

---

## 📊 Advanced Analytics & Reporting (The Evolution)

### 1. Performance Metrics
* Calculates complex profitability algorithms including Internal Rate of Return (**IRR/TIR**), Time-Weighted Return (**TWR**), and the Extended Money-Weighted Return (**XIRR/MWR**) to provide a true picture of portfolio performance based on irregular cash flows.

### 2. Yield Tracking & Dividend Automation
* **Yield on Cost vs. Dividend Yield:** Differentiates between market yield and the investor's actual yield based on historical purchasing prices.
* **Data-Com (Ex-Dividend Date) Automation:** By inputting corporate action details, the engine queries the historical database to determine exact share quantities held across all brokers on that specific ex-date, calculating precise dividend entitlements and applying withholding tax (IRRF) deductions automatically.

### 3. Automated Valuation
* Integrates with an external Google Sheets API to fetch real-time market data and fundamental indicators (BVPS, EPS) to calculate Benjamin Graham's Intrinsic Value and Décio Bazin's Maximum Price algorithms.

---

## 🔄 Portfolio Rebalancing & Tax Compliance

* **Dynamic Rebalancing:** Calculates actionable rebalancing plans based on user-defined target allocations per asset category, computing ideal vs. current percentages and projecting post-contribution allocations.
* **Tax Compliance Engine:** Dynamically calculates capital gains and deductions following standard Brazilian tax rules, seamlessly preparing the data for tax filing.

---

## 🚀 Private Production Environment Highlights
*Note: The features below are actively running in the private, monolithic production version of this system and are slated for future modularization into this open PoC repository.*

* **Advanced Rebalancing Parameters:** Implementation of "Safe Mode" (strictly respecting target allocation) and "Opportunistic Mode" (bypassing allocation to suggest assets meeting a dynamic, user-defined profit threshold).
* **Granular Tax Rules (ReVar Compliance):** Strict enforcement of edge-case tax legislations, such as nullifying the standard R$ 20k capital gains tax exemption specifically for "Units".

---

## 🛠️ Architecture Notes
This PoC branch was deliberately constructed using **Vanilla JavaScript** without heavy frameworks. The primary goal was to validate the complex mathematical models, tax rules, and state management logic through strict modularization (MVC/SoC). For a production-grade environment, the UI layer would be migrated to React/TypeScript, while maintaining this pure, framework-agnostic business logic core.
