// 圧縮表記を必要な単語だけ復号する。全単語を展開した辞書はメモリに作らない。
const own=(object,key)=>Object.hasOwn(object,key);
function validate(data,withOnsets=false){
 if(data?.format!==1||!data.symbols||typeof data.symbols!=='object'||!data.words||typeof data.words!=='object'||Array.isArray(data.words)||!own(data.words,'a')||(withOnsets&&!Array.isArray(data.onsets)))throw new Error('辞書形式が正しくありません。');
}
export function createDictionaries(pronunciation,pos){
 validate(pronunciation,true);validate(pos);
 return {
  onsets:pronunciation.onsets,
  has(word){return own(pronunciation.words,word);},
  pronunciations(word){
   if(!own(pronunciation.words,word))return null;
   return pronunciation.words[word].split('/').map(form=>[...form].map(id=>{
    if(!own(pronunciation.symbols,id))throw new Error('未対応の音素です。');
    return pronunciation.symbols[id];
   }).join(' '));
  },
  tag(word){return own(pos.words,word)?pos.symbols[pos.words[word]]:null;}
 };
}
// ハッシュ付きURLと通常のHTTPキャッシュで、画面更新と辞書の更新を分離する。
export async function loadDictionaries(pronunciationUrl,posUrl,fetcher=fetch){
 const load=async url=>{
  const response=await fetcher(url,{credentials:'same-origin'});
  if(!response.ok)throw new Error('辞書の取得に失敗しました。');
  return response.json();
 };
 const [pronunciation,pos]=await Promise.all([load(pronunciationUrl),load(posUrl)]);
 return createDictionaries(pronunciation,pos);
}
