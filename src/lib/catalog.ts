export type Product = {id:string; title:string; seller:string; price:number; type:'physical'|'digital'; mark:string; color:string; category:string; slug:string; preview?:boolean; image?:string};
export const products: Product[] = [
  {id:'p1',title:'Trà sen Tây Hồ',seller:'Nhà Trà An Nhiên',price:185000,type:'physical',mark:'Trà sen',color:'linear-gradient(145deg,#c4b482,#647857)',category:'Đặc sản',slug:'tra-sen-tay-ho'},
  {id:'p2',title:'Bộ preset Sương Mai',seller:'Linh Studio',price:249000,type:'digital',mark:'Preset',color:'linear-gradient(145deg,#dfa986,#935c48)',category:'Sáng tạo số',slug:'bo-preset-suong-mai'},
  {id:'p3',title:'Gốm men biển',seller:'Xưởng Gốm Mơ',price:420000,type:'physical',mark:'Gốm',color:'linear-gradient(145deg,#76a0a0,#365c65)',category:'Thủ công',slug:'gom-men-bien'},
  {id:'p4',title:'Sổ tay Nếp Nhà',seller:'Tiệm Giấy Nhỏ',price:129000,type:'physical',mark:'Nếp nhà',color:'linear-gradient(145deg,#c58b6c,#785540)',category:'Đời sống',slug:'so-tay-nep-nha'},
  {id:'p5',title:'Bộ icon Mùa Nắng',seller:'Linh Studio',price:89000,type:'digital',mark:'Icon',color:'linear-gradient(145deg,#ebc56f,#b4774f)',category:'Sáng tạo số',slug:'bo-icon-mua-nang'},
  {id:'p6',title:'Mứt gừng Huế',seller:'Bếp Cô Tâm',price:98000,type:'physical',mark:'Mứt gừng',color:'linear-gradient(145deg,#b98c55,#745336)',category:'Đặc sản',slug:'mut-gung-hue'},
  {id:'p7',title:'Ảnh nền Việt Nam',seller:'Mai Phương',price:159000,type:'digital',mark:'Ảnh',color:'linear-gradient(145deg,#8f9e7c,#53624d)',category:'Sáng tạo số',slug:'anh-nen-viet-nam'},
  {id:'p8',title:'Khăn dệt Mộc Châu',seller:'Nhà Dệt Mây',price:360000,type:'physical',mark:'Dệt tay',color:'linear-gradient(145deg,#b88978,#774f55)',category:'Thủ công',slug:'khan-det-moc-chau'}
];
for (const product of products) product.preview=true;
export const formatVnd = (value:number,locale='vi') => new Intl.NumberFormat(locale==='vi'?'vi-VN':locale,{style:'currency',currency:'VND',maximumFractionDigits:0}).format(value);
