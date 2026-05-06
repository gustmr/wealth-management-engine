# Wealth Management & Portfolio Rebalancing Engine (PoC)
🚀 **Live Demo:** [Click here to access the running system](https://investments-demo.netlify.app/#) *(Fully updated with the latest production features, including dynamic English localisation)*

## 📌 Overview
This project is a Proof of Concept (PoC) for a comprehensive Wealth Management system. Born from the need to solve real-world asset allocation and tax calculation challenges, it has evolved into a robust, fully modularised financial logic engine.

Initially engineered to solve the operational complexities of tracking multi-broker custody and maintaining average cost basis integrity, the system later evolved to incorporate advanced performance analytics and granular tax compliance. It is built with a hybrid Offline-First architecture, utilising LocalStorage for zero-latency scenario simulations, seamlessly integrated with **Firebase** for secure, real-time cloud data persistence.

## ⚙️ Core Architecture & Problems Solved (The Foundation)

### 1. Multi-Broker Consolidation & Average Cost Basis Integrity
* Maintains rigorous mathematical accuracy for the Average Cost Basis (Preço Médio) across multiple checking and investment accounts.
* Seamlessly handles Custody Transfers between different brokers, ensuring historical cost basis and position integrity remain completely intact without data loss.

### 2. Time-Travel State (Historical Snapshots)
* Features a robust querying engine capable of reconstructing the exact portfolio position, valuation, and asset distribution at any specific date in the past—crucial for auditing and historical reconciliation.

### 3. Corporate Actions Engine
* Automatically processes and adjusts historical average costs and share quantities resulting from complex corporate events, such as Stock Splits and Reverse Splits (Grupamentos).

### 4. T+2 Settlement & Trade Management
* Incorporates banking holiday calendars to accurately calculate T+2 (D+2) settlement dates for variable income operations.
* **Simulated vs. Manual Ledgers:** Trades can be inputted manually or generated automatically via a "Scenario Simulator" that projects the impact of a trade before execution.

## 📊 Advanced Analytics & Reporting (The Evolution)

### 1. Performance Metrics
* Calculates complex profitability algorithms including Internal Rate of Return (IRR/TIR), Time-Weighted Return (TWR), and the Extended Money-Weighted Return (XIRR/MWR) to provide a true picture of portfolio performance based on irregular cash flows.

### 2. Yield Tracking & Dividend Automation
* **Yield on Cost vs. Dividend Yield:** Differentiates between market yield and the investor's actual yield based on historical purchasing prices.
* **Data-Com (Ex-Dividend Date) Automation:** By inputting corporate action details, the engine queries the historical database to determine exact share quantities held across all brokers on that specific ex-date, calculating precise dividend entitlements and applying withholding tax (IRRF) deductions automatically.

### 3. Automated Valuation
* Integrates with an external Google Sheets API to fetch real-time market data and fundamental indicators (BVPS, EPS) to calculate Benjamin Graham's Intrinsic Value and Décio Bazin's Maximum Price algorithms.

## 🔄 Portfolio Rebalancing & Tax Compliance (The Business Logic)

### 1. Dynamic Rebalancing Engine
Calculates actionable rebalancing plans based on user-defined target allocations per asset category, computing ideal vs. current percentages and projecting post-contribution allocations. It features advanced decision-making parameters:
* **Safe Mode:** Strictly respects the ideal target allocation defined by the user.
* **Opportunistic Mode:** Bypasses standard allocation to suggest purchasing assets that meet a dynamic, user-defined profit threshold.

### 2. Granular Tax Compliance Engine (ReVar Ready)
Dynamically calculates capital gains and deductions following strict Brazilian tax rules, seamlessly preparing the data for tax filing.
* **Granular Rules:** Strict enforcement of edge-case tax legislations, including the recent logic to nullify the standard R$ 20k capital gains tax exemption specifically for bundled assets ("Units").
* Automatically handles historical loss offsetting and specific withholding tax rules.

## 🛠️ Architecture Notes
* **Framework-Agnostic Core:** This codebase was deliberately constructed using Vanilla JavaScript without heavy frameworks. The primary goal was to validate the complex mathematical models, tax rules, and state management logic through strict modularisation (MVC/SoC).
* **Dynamic Localisation (Observer Pattern):** Instead of relying on static i18n tagging, the system implements a custom `MutationObserver` engine that dynamically intercepts and translates DOM repaints on the fly. This architectural trade-off was chosen to rapidly deploy full localisation across highly dynamic, heavily scripted UI components without risking the integrity of the underlying financial calculation logic.
* **Cloud Persistence (Firebase):** Integrates Firebase for real-time database management and secure data storage. This hybrid approach ensures reliable cross-device synchronisation while maintaining the rapid performance benefits of an offline-first local state.
