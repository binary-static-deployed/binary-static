import React from 'react';

const Step = ({ img_src, header, text, circle_no }) => (
    <div className='step'>
        <div className='border-bottom' />
        <div className='circle'>{ circle_no }</div>
        <div className='gr-padding-20 gr-gutter center-text'>
            {!!img_src && <img className='gr-4 gr-centered' src={img_src} />}
            {!!header  && <div className='gr-padding-20 gr-child'><strong>{header}</strong></div>}
            {!!text    && <p className='no-margin gr-padding-10'>{text}</p>}
        </div>
    </div>
);

export default Step;