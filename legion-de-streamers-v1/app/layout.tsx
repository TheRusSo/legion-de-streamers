import "./globals.css";

const BRAND_LOGO_DATA = "data:image/webp;base64,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".toString();

const brandStyles = `
  nav{
    height:auto!important;
    min-height:94px!important;
    padding-top:10px!important;
    padding-bottom:10px!important;
  }

  .brand{
    gap:14px!important;
    align-items:center!important;
  }

  .brand>b{
    width:74px!important;
    height:74px!important;
    min-width:74px!important;
    border-radius:16px!important;
    background-image:url("${BRAND_LOGO_DATA}")!important;
    background-size:contain!important;
    background-position:center!important;
    background-repeat:no-repeat!important;
    background-color:transparent!important;
    box-shadow:0 0 28px #ff4b0066,0 0 10px #ffd16655 inset!important;
    border:1px solid #5b2b14!important;
    color:transparent!important;
    font-size:0!important;
    text-shadow:none!important;
  }

  .brand>span{
    display:flex!important;
    flex-direction:column!important;
    gap:2px!important;
    font-size:0!important;
    letter-spacing:0!important;
    line-height:.9!important;
  }

  .brand>span:before{
    content:"LEGIÓN";
    display:block;
    font-weight:1000;
    font-size:clamp(24px,2.25vw,34px);
    letter-spacing:1px;
    color:#ffd15a;
    background:linear-gradient(180deg,#fff4b6 0%,#ffd35a 32%,#f08c11 68%,#7c3105 100%);
    -webkit-background-clip:text;
    background-clip:text;
    color:transparent;
    -webkit-text-stroke:1px #3b1400;
    text-shadow:0 1px 0 #fff4,0 2px 0 #8a3200,0 4px 0 #3b1400,0 7px 13px #000b,0 0 18px #ff3d00b0;
  }

  .brand small{
    display:block!important;
    margin-top:0!important;
    color:transparent!important;
    font-size:0!important;
    letter-spacing:0!important;
  }

  .brand small:before{
    content:"DE STREAMERS";
    display:block;
    font-weight:1000;
    font-size:clamp(16px,1.55vw,23px);
    letter-spacing:.5px;
    background:linear-gradient(180deg,#ffffff 0%,#d9d2ca 35%,#9b8d86 70%,#4c403c 100%);
    -webkit-background-clip:text;
    background-clip:text;
    color:transparent;
    -webkit-text-stroke:1px #191212;
    text-shadow:0 1px 0 #fff3,0 2px 0 #6e625c,0 4px 0 #241a18,0 7px 13px #000b;
  }

  @media(max-width:720px){
    nav{min-height:82px!important;}
    .brand>b{width:58px!important;height:58px!important;min-width:58px!important;border-radius:13px!important;}
    .brand>span:before{font-size:21px!important;}
    .brand small:before{font-size:15px!important;}
  }
`;

export const metadata = {
  title: "Legión de Streamers",
  description: "Directorio oficial de streamers de la comunidad"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <style dangerouslySetInnerHTML={{ __html: brandStyles }} />
        {children}
      </body>
    </html>
  );
}
