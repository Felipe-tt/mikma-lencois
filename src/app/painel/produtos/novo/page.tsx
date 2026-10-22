import ProductForm from '@/components/seller/ProductForm';

export default function NovoProdutoPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-7">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-clay mb-1">Catálogo</p>
        <h1 className="font-display font-normal text-ink text-2xl">Novo produto</h1>
      </div>
      <ProductForm />
    </div>
  );
}
