import ProductForm from '@/components/seller/ProductForm';

export default function NovoProdutoPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-normal text-ink text-2xl">Novo produto</h1>
        <p className="text-xs text-faint mt-1">Tire uma foto do produto para começar</p>
      </div>
      <ProductForm />
    </div>
  );
}
