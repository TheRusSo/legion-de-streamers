import "./globals.css";

const BRAND_LOGO_DATA = "data:image/webp;base64,UklGRiwLAABXRUJQVlA4WAoAAAAQAAAANwAANwAAQUxQSJUDAAABoC3Jtmnban30sbbOtW3btm3btm3btm3bPLZt+6y91+i9PSye8QURMQGoU1A9AGhbd9PNN19zAUABQNBowUKHQyqJQA97s/fEqdOmje91wzoAoFhnW4SGIOhP9yKWBYTdf2aN9mwbFMv2PRzamIjHeS6CQLDQe2RK5uUd7HxBS8BSnTvWRGjUgyW7ESHogm8xJVY2ftAKxSr/cfCKkEbdT34aFfFzllg18VtIRMsuHTZpmUaJbPAXH8OrW649w72ae/f9gRtOW3YKrykIGhyxU3vvw9rnjKaz9re/4puv8OcgDdEYI3BpIp101mxOGuk/tKCgKnUIyhe4jW5Od9abEs2MnywJAKEmgR565im396FzfiYOuOaY/VaG1NT6AcsT56+RTBP3glaL8bRRc1MqGee3lSyVflo6ahUgLtaPxhyNPddqQmWJW93waGdz5un246M3rqMCKNaawtxfRYBgqTc4d6xl1D7cJ++FIEsN4tuHvc98ffY1R86ctDxw8XeXrvYtLR8yHbsFNwXuvwS3sYMZGwdccV+LYI0H9NBknpN/tQrKC3qS58UfAYFgzSteYWJWv++/KARb/n3UAcWsyn9aRKTzZ3vuPoCelXVwfcSxX77rJeZtvK8gcvb0wc68E/8HJOAAWl5uxZ132QJBl5hKz4tTr7/vIAjOpDFvJ7dGWPC4Y+mZMdkdKOx3N0bTMzM+uznWHfhCv+w4b4cr18Td7GDmxu649iDF00yZkZMf77uSyKKjaLk5jwek6UjzzIz3Q6GF280yc98UGrCXuWdm/KIQZOmBZsw98SjgOTI7I/suLBvdNoqZO2e+uVMEsPgtxayMP60HAKEZu5VSTonvQQMAxT0s5eScsQoEABYZ6Ob5OEt+FiKgOJ5MrO7JGmElr0ZP/EEDEMLTA8ZxmpE0c5I0q8cSSbqZk5zo7T0HrI0AyIJy7ul7TaeTpI958gcyJa/BEtnr0W7GcvcDd7+7eaE2VJQCtmwvWfH/vwexXwgn/kd68jJPRg66eEG8z7FdO0/zIo9GUFQWhLjuaPKVlgWW2PKmVYG2o3900kgj2f2ixYHFH9htuUXariVnHaURUqniGteM/FcFAEQB7PTCDLpz9rv7tgBRAoCAF2bcvRHqFWDxG1cTDQpANABrfEN+tyEAFQCqKgtfsTog9SAoEFCjRqwwo7gqogqqK6ABDZSA2iNuvg8RtQdBlhKbReqoHQBWUDggcAcAAHAfAJ0BKjgAOAA+jTaVSCUjIiEx7bCgEYlsAKw5wNUd7P4DzBK3/kNjQLFYD9RG2M8wH68fsB7y/+n/YD3G/5v0zPSZ9RL0Gv0r9N/2Kv77/z/3KsqTE7yA+1sz3FfPRw18gXfMmp8IfdfQC9kvrP/A8I7UCvQ/PD/DeBT9J/w3sAfzP+2eqr/L/+vyd/m/+K/8v+U+AL+bf2D0zvZf+3ns+/tiQJ4LY/VUdt+6+6fsnPd3jQKghoU4rxrrSx+vT9cGGUyruwx9GBZkXe7wQgJszODki6TAnZXgw06xqig4nKXQHJ3PpMcaU1UYxxCfJE9/NPVbE9gvk4Yxm2HRzm64iOAAAP78qQ+RWRMbpxAnUgWDSNmLT1OuHpD0QmDYl1yrNvZ5GNcS+x30vRMipwnXG7TGVT0RFzuh07G+E7yzQJzbU+NgW1LuGqYNgWbSJfpjbbd6gkd3/cW5EzURiXUsrazdB1entUwSu8umePivxmJhOM7E6cvszc6Aj0yCjrBD7niTClfwIaHs5P8SAYZ2MxVg4Kup9nHX/SuofWudzQhtebxqhaPc1pw9FdNVaUMDhJoK7I0fADnLFIgqmlnWJQFe9TThkXuSAWp7StY2EYUEtJ/9KvD7icd2jO30TP0gVpfxAmvalOWaTijhncB2Sv3QWPqQZ2PS+6xQL8iC0Qs8E5pM7OeOwGMo9a2Zt6dM6bf7UWSO5SpQr9Fz7Zp2j4+kqcS1Q34QlxlRTFY7R+rLTm4HbF51ghdIoqJySYWRuZ/SKcHI2qHDJehj8d64EgkjgGbyRy58w4mC1pb/VV8h95AWl//VGhqzyJ4fv+lcakvoOO3AbSepFPbJBH/P2lGvU6Fi5Eqg/hLsFXf3xBx6w5ud+Jw4au9LHciWNgTUClVMg3lr3FzUyg7itxa7NdG57GxmCzuXWey1zxs4XsoDNuguDVnEOluElvMy8l4tvP3XvGN4OV7LDCYrbBbKrIl6wth+bJGWMeGmszYVvAhN5EovzJV+YgbmcswFAAExu2eUvD3Raa2KYaY9/WO/n0mQBfIuG8TG6PD2t/qtqAgER8+BrMfu0Kv33GacGFi1g3MyMGaGEPyQaC0byjRAYcoJzH03sh9SzAXebs83nl1KumQrrtFCquA08fZ22nMItSOP4rw2mMBo4ksCw6Xm+8D/eueGO0yVtMENNcLK8Qx5qLIlM5jZhVwvVVAZgXn/LqzPE1e/G20YTMt0GuxdY4jTTDB0iAwa14sAETWqv9CHcZ9zRyY+J7JWYidv1VWWNH7ZBZ4Fn4VOW9wajuA8zxvBLkzCQ9o5poxVxOF7NUBkcPxoljctsFnbZbd4i3Xnb7mbJwto9cOmGKLP265YT7pc/7bZggGYKyUUKjKqXm+LTuKxHJmeha68tqPht6UyIic/unBB/ghpqfjXEErf2gCzv/rbQGRjsTz/zGZ4z1ZAPNNLMgIGNvON5O+CpACiRWD/O+wualDhkSnZHaCPdb+fxvse/Nrb5SdxZ8zr2jCqgq4Qxy/J3lZ+Ca2k/dfZMsrCe9A26EfhY/VJxe5nInfTLtgKdnDDG1V9TELZ5mI7rU31q+Wfv+lA+iUVFB/KTVd+D6I4Ig2eu2oOnuEPCZ2h5WXSWrKIhUHpUvkKAwtHiJ+NkPeA/U/+nyaAwwfoaOjtqqLENAxzcU5Tznfh6iI46ntlJ4ozyA76dNRZS3owFmPj1uO2PxdpyQtpztulPanQAneEMXEAteDeTt80SjeJj2Pl3XXHGsIH0dr/DF2DQ9K3pIK1kyY8C6y09YDJu1kLId5Oy7RJhnHGTXLz1R4C6LYilCjVCXxh4ZhLIXcYOL0kriJjDX5Uq0Kw1HnqFS1Z0HOMYUsIpP0ziRvxVxJJMesrsAloho2keeGpYPLW8zd1f9Fz4w7L07nk87cylX2dn4e6wpw+/rJ5LXxZA0gj2Qngh/fhMK8abtgJbFvuxyAggCJQ1NCWCAfOCGDon760ZGVgZPwvkTrYGx/Ki79ea34FXOH/UCBf+Xjr2vYR19jiM8IU309ipowQsvn7Fw+F+PieUzp8H4EaR3okglLkG4NT8fSnk6/8xDXYcr43Au16m+w+CVPmu0Q84yQL4xBoSSAik+Xd4N+7Em1nq9PPtf72beXXyQV1TPiCOAWOa1x7vIWobHUR6uOk4OSD/cVZhgJuSLz3yaPMgLnuIrwc1j4Q5WSHBTd5fSEjTr5/RoAEsHjn7BWGZw3cffJf+k/JPA9mOjMK8tFmTuvg9aw16LrK+xSeX9J0BY/FKIirwAJ8vBPvBVXpsz7iU4nT1MdXceRMw45geRxNtizWsL69qYMfwFhQsgeQ7XKu9wH4RK1VbYXKTjUMq0JNLw4tBat9x9tKLJWaMYjSN0O52Fz8ce7/E3IiF6SNvL0jnyb3r9GsV0nfPGGZobUz2BA7Ldj6uxsxSFz/zOkGK2eK35eZE/r0k2w2HsiSzJ3yunWszHl3X7o+4zpoUFm4gtPm6cpH3sWbCxEuaBBSDMXNnAdoHIwmndwllUXroEAA";

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
