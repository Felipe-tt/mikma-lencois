import ProductForm from '@/components/seller/ProductForm';

export default function NovoProdutoPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-7">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C4714A] mb-1">Catálogo</p>
        <h1 className="font-display font-normal text-[#1E1208] text-2xl">Novo produto</h1>
        <p className="text-[12px] text-[#B09C8C] mt-1">Tire uma foto do produto para começar</p>
      </div>
      <ProductForm />
    </div>
  );
}
