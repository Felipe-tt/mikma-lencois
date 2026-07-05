// Erro usado para sinalizar estoque insuficiente dentro de transações do
// Firestore (permite distinguir "estoque insuficiente" de qualquer outra
// falha inesperada que a transação possa lançar).
export class StockError extends Error {}
