import ProductForm from '@/components/seller/ProductForm';

export default function NovoProdutoPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-ink mb-6">Novo produto</h1>
      <ProductForm />
    </div>
  );
}
